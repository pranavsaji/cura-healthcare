import fp from "fastify-plugin";

/**
 * Request correlation + timing. Decorates every request with a null tenant
 * (filled by the auth plugin), echoes the request id header, and logs one
 * structured line per response with `orgId`, method, status, and duration — no
 * PHI (CONVENTIONS §6; the logger redacts by default).
 */
export const requestContextPlugin = fp(
  async function requestContext(app) {
    app.decorateRequest("tenant", null);

    app.addHook("onRequest", async (req, reply) => {
      reply.header("x-request-id", req.id);
    });

    app.addHook("onResponse", async (req, reply) => {
      req.log.info(
        {
          requestId: req.id,
          method: req.method,
          url: req.url,
          statusCode: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
          orgId: req.tenant?.orgId,
          userId: req.tenant?.userId,
        },
        "request.completed",
      );
    });
  },
  { name: "request-context" },
);
