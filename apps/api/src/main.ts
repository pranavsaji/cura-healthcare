import type { FastifyInstance } from "fastify";
import { resolveConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createMemoryPlatform, createPostgresPlatform, type Platform } from "./platform/index.js";
import { registerRealtime } from "./realtime/index.js";

/**
 * Process entrypoint: resolve config, build the platform (Postgres when
 * `DATABASE_URL` is set, else in-memory), start the gateway, and shut down
 * gracefully — draining in-flight requests and releasing store connections.
 */
const config = resolveConfig();

const platform: Platform = config.DATABASE_URL
  ? await createPostgresPlatform(config)
  : createMemoryPlatform({
      sessionSecret: config.SESSION_SECRET ?? config.ENCRYPTION_KEY,
      rateLimitPerMin: config.RATE_LIMIT_PER_MIN,
      webOrigin: config.WEB_ORIGIN,
      nodeEnv: config.NODE_ENV,
      secureCookies: config.NODE_ENV === "production",
    });

const app: FastifyInstance = await buildApp(platform, { realtime: registerRealtime(platform) });

try {
  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  platform.logger.info(
    { port: config.API_PORT, store: platform.kind, asr: config.ASR_PROVIDER, llm: config.LLM_PROVIDER },
    "Cura API listening",
  );
} catch (err) {
  platform.logger.error({ err }, "failed to start");
  await platform.shutdown();
  process.exit(1);
}

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    platform.logger.info({ signal }, "shutting down");
    void app
      .close()
      .then(() => platform.shutdown())
      .then(() => process.exit(0))
      .catch((err) => {
        platform.logger.error({ err }, "error during shutdown");
        process.exit(1);
      });
  });
}
