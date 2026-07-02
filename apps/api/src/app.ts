import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Telemetry } from "@cura/telemetry";
import type { Platform } from "./platform/index.js";
import { requestContextPlugin } from "./plugins/request-context.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { securityPlugin } from "./plugins/security.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { openapiPlugin } from "./plugins/openapi.js";
import { metricsPlugin } from "./plugins/metrics.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/sessions.js";
import { noteRoutes } from "./routes/notes.js";
import { templateRoutes } from "./routes/templates.js";
import { integrationRoutes } from "./routes/integrations.js";
import { agentRunRoutes } from "./routes/agent-runs.js";
import { auditRoutes } from "./routes/audit.js";

export interface BuildAppOptions {
  /** Optional realtime (WS) registrar — supplied by Phase 07. */
  realtime?: (app: FastifyInstance) => Promise<void>;
  /** Inject a telemetry sink (tests use in-memory to assert spans). */
  telemetry?: Telemetry;
}

/**
 * Build (but do not start) the API gateway bound to a {@link Platform}. Kept
 * separate from `main.ts` so tests drive it with `app.inject()` — no port, no
 * sockets. Plugin order matters:
 *   error-handler → request-context → auth → rate-limit → metrics → openapi.
 * Cross-cutting concerns are plugins (composable, reused by future apps);
 * handlers delegate to `libs/*`.
 */
export async function buildApp(
  platform: Platform,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    // Cast to the base logger type so the instance keeps Fastify's default
    // logger typing (route modules take a plain FastifyInstance).
    loggerInstance: platform.logger as unknown as FastifyBaseLogger,
    disableRequestLogging: true, // we emit one structured line per response
    trustProxy: true,
  });

  app.decorate("platform", platform);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Cross-cutting plugins (fastify-plugin → decorators/hooks are global).
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);
  await app.register(cors, { origin: [platform.settings.webOrigin], credentials: true });
  await app.register(securityPlugin, {
    webOrigin: platform.settings.webOrigin,
    // HSTS + TLS-terminated assumptions hold in prod (secure cookies on).
    enableHsts: platform.settings.secureCookies || platform.settings.nodeEnv === "production",
    sessionCookieName: platform.settings.sessionCookieName,
  });
  await app.register(websocket);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(metricsPlugin, opts.telemetry ? { telemetry: opts.telemetry } : {});
  await app.register(openapiPlugin);

  // Routes (thin — capability lives in libs).
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(noteRoutes);
  await app.register(templateRoutes);
  await app.register(integrationRoutes);
  await app.register(agentRunRoutes);
  await app.register(auditRoutes);

  if (opts.realtime) await app.register(opts.realtime);

  await app.ready();
  return app;
}
