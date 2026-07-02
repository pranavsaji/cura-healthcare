import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AuthError, ForbiddenError, Role } from "@cura/shared";
import { tenantOf } from "../plugins/context.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../platform/directory.js";

const DevLoginBody = z.object({ role: Role.default("clinician") });
const CallbackQuery = z.object({ code: z.string().min(1), state: z.string().optional() });

/**
 * Session lifecycle for the web app. Contract: the API sets an HttpOnly
 * `cura_session` cookie on login; the browser sends it automatically (CORS is
 * credentialed). `/auth/me` returns the current context (no PHI). `/auth/dev-login`
 * exists only when the dev provider is active; SSO login/callback proxy WorkOS.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { auth, settings } = app.platform;

  // Dev-only shortcut: mint a session for a chosen role without an IdP.
  r.post(
    "/auth/dev-login",
    { schema: { body: DevLoginBody }, config: { public: true } },
    async (req, reply) => {
      if (!auth.provider.devSubject) {
        throw new ForbiddenError("Dev login is disabled");
      }
      const role = req.body.role;
      const token = auth.issueSession({ userId: DEV_USER_IDS[role], orgId: DEV_ORG_ID, role });
      reply.header("set-cookie", auth.sessions.toSetCookie(token));
      return { ok: true, role, token };
    },
  );

  // Begin SSO (redirects the browser to the IdP).
  r.get("/auth/login", { config: { public: true }, schema: { hide: true } }, async (_req, reply) => {
    if (!auth.provider.authorizationUrl) {
      throw new ForbiddenError("SSO is not configured");
    }
    const state = `s_${app.platform.settings.nodeEnv}_${Date.now()}`;
    const url = auth.provider.authorizationUrl({
      state,
      redirectUri: `${settings.webOrigin}/auth/callback`,
    });
    return reply.redirect(url);
  });

  // SSO callback: exchange the code, set the session cookie, bounce to the app.
  r.get(
    "/auth/callback",
    { schema: { querystring: CallbackQuery, hide: true }, config: { public: true } },
    async (req, reply) => {
      if (!auth.provider.completeLogin) throw new ForbiddenError("SSO is not configured");
      const subject = await auth.provider.completeLogin(req.query.code);
      const token = auth.issueSession(subject);
      reply.header("set-cookie", auth.sessions.toSetCookie(token));
      return reply.redirect(settings.webOrigin);
    },
  );

  r.post("/auth/logout", { config: { public: true }, schema: { hide: true } }, async (_req, reply) => {
    reply.header("set-cookie", auth.sessions.clearCookie());
    return { ok: true };
  });

  // Current identity (protected). No PHI — ids, role, permissions only.
  r.get("/auth/me", async (req) => {
    const ctx = tenantOf(req);
    if (!ctx) throw new AuthError();
    return {
      orgId: ctx.orgId,
      userId: ctx.userId,
      role: ctx.role,
      permissions: ctx.permissions,
    };
  });
}
