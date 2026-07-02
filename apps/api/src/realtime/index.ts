import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { Platform } from "../platform/index.js";
import { RealtimeHub } from "./hub.js";
import { Connection, type SocketLike } from "./connection.js";
import { createMessageHandler } from "./handlers.js";
import { parseClientMessage } from "./protocol.js";

export * from "./pubsub.js";
export * from "./hub.js";
export * from "./protocol.js";
export { Connection } from "./connection.js";
export { createMessageHandler } from "./handlers.js";

/**
 * Register the realtime WS gateway. The `/ws` route is a normal (protected)
 * Fastify route, so the auth + rate-limit plugins run on the upgrade request:
 * an unauthenticated upgrade is rejected with `401` before any socket opens, and
 * `req.tenant` is available to the handler. Fan-out goes through the platform's
 * pub/sub, so any replica can serve any socket.
 */
export function registerRealtime(platform: Platform): (app: FastifyInstance) => Promise<void> {
  const hub = new RealtimeHub(platform.pubsub);
  const handle = createMessageHandler({
    storeFor: (ctx) => platform.stores.forTenant(ctx),
    audit: platform.audit,
  });

  return async function realtime(app: FastifyInstance) {
    app.get("/ws", { websocket: true, schema: { hide: true } }, (socket: WebSocket, req: FastifyRequest) => {
      const ctx = req.tenant;
      if (!ctx) {
        // Defensive: the auth plugin should already have rejected this.
        socket.close(4401, "unauthorized");
        return;
      }

      const conn = new Connection(socket as unknown as SocketLike, ctx, {
        hub,
        logger: platform.logger,
      }, () => Date.now());
      conn.startHeartbeat();

      socket.on("pong", () => conn.onPong());

      socket.on("message", (raw: Buffer) => {
        conn.markActivity();
        let msg;
        try {
          msg = parseClientMessage(raw);
        } catch {
          conn.send({ type: "error", message: "invalid message" });
          return;
        }
        // Handle frames strictly in order (stateful protocol).
        void conn.enqueue(() =>
          handle(conn, msg).catch((err) => {
            req.log.error({ err, sessionId: conn.sessionId }, "realtime.handler_error");
            conn.send({ type: "error", message: "internal error" });
          }),
        );
      });

      socket.on("close", () => void conn.close());
      socket.on("error", () => void conn.close());
    });
  };
}
