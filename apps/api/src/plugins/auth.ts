import fp from "fastify-plugin";
import { readToken } from "./context.js";

/**
 * Authentication: on every non-public route, resolve a {@link TenantContext}
 * from the session token (cookie or `Authorization: Bearer`) and attach it to
 * the request. With no token, the dev provider yields the seeded context
 * (local/tests); a real IdP has no fallback, so a missing/invalid token throws
 * {@link AuthError} → mapped to `401` by the error handler.
 *
 * The same `AuthService.authenticate` powers the WS upgrade (Phase 07), so HTTP
 * and realtime share one identity path.
 */
export const authPlugin = fp(
  async function auth(app) {
    app.addHook("onRequest", async (req) => {
      if (req.routeOptions?.config?.public) return;
      const token = readToken(req, app.platform.settings.sessionCookieName);
      req.tenant = await app.platform.auth.authenticate(token, req.id);
    });
  },
  { name: "auth", dependencies: ["request-context"] },
);
