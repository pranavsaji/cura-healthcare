import fp from "fastify-plugin";
import { RateLimitError } from "@cura/shared";

/**
 * Per-tenant rate limiting (CONVENTIONS §2 — scalable, Redis-backed in prod).
 * Keyed by `org:user` once authenticated, or by client IP pre-auth. Emits the
 * standard `X-RateLimit-*` headers and throws {@link RateLimitError} (→ 429)
 * when the window is exceeded. Runs after auth so the key is tenant-scoped.
 */
export const rateLimitPlugin = fp(
  async function rateLimit(app) {
    const windowMs = 60_000;
    app.addHook("onRequest", async (req, reply) => {
      if (req.routeOptions?.config?.public) return;
      const key = req.tenant ? `${req.tenant.orgId}:${req.tenant.userId}` : `ip:${req.ip}`;
      const limit = app.platform.settings.rateLimitPerMin;
      const result = await app.platform.rateLimiter.hit(key, limit, windowMs);
      reply.header("x-ratelimit-limit", result.limit);
      reply.header("x-ratelimit-remaining", result.remaining);
      reply.header("x-ratelimit-reset", Math.ceil(result.resetAt / 1000));
      if (!result.allowed) {
        reply.header("retry-after", Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000)));
        throw new RateLimitError();
      }
    });
  },
  { name: "rate-limit", dependencies: ["auth"] },
);
