import type { FastifyInstance } from "fastify";

/**
 * Liveness + readiness probes (public, unauthenticated). `/health` proves the
 * process is up; `/ready` proves backing stores (DB/Redis) are reachable and
 * returns `503` when they are not, so a load balancer can drain the replica.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", { config: { public: true }, schema: { hide: true } }, async () => ({
    ok: true,
    ts: new Date().toISOString(),
  }));

  app.get("/ready", { config: { public: true }, schema: { hide: true } }, async (_req, reply) => {
    const report = await app.platform.ready();
    return reply.code(report.ok ? 200 : 503).send({ ok: report.ok, checks: report.checks });
  });
}
