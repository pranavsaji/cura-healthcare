import fp from "fastify-plugin";
import { ForbiddenError } from "@cura/shared";

/**
 * Phase 16 — cross-cutting security hardening for the gateway. Two concerns, one
 * plugin, applied uniformly to every route (CONVENTIONS §2 — controls are global,
 * not per-feature):
 *
 * 1. **Security headers** on every response (equivalent to a locked-down helmet
 *    config, hand-rolled to avoid a new dependency). The API only ever returns
 *    JSON, so the CSP is maximally strict (`default-src 'none'`).
 * 2. **CSRF defense** for cookie-authenticated, state-changing requests. Bearer
 *    tokens are immune to CSRF (a browser won't attach them cross-site), so those
 *    are exempt; cookie-authenticated mutations must carry an `Origin`/`Referer`
 *    that matches the configured web origin. Public routes are exempt.
 *
 * CORS lockdown itself is configured where `@fastify/cors` is registered
 * (`origin: [webOrigin], credentials: true`) — this plugin complements it.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface SecurityOptions {
  /** The single allowed browser origin (same value CORS uses). */
  webOrigin: string;
  /** Send HSTS + treat as TLS-terminated (prod). */
  enableHsts: boolean;
  /** Cookie name used for session auth (to detect cookie-auth requests). */
  sessionCookieName: string;
}

/** Is this request authenticated by cookie rather than a bearer token? */
function isCookieAuth(headers: Record<string, unknown>, cookieName: string): boolean {
  const auth = typeof headers.authorization === "string" ? headers.authorization : "";
  if (/^Bearer\s+/i.test(auth.trim())) return false;
  const cookie = typeof headers.cookie === "string" ? headers.cookie : "";
  return cookie.split(";").some((p) => p.trim().startsWith(`${cookieName}=`));
}

/** Compare a URL's origin (scheme + host + port) to the allowed origin. */
function originMatches(value: string | undefined, allowed: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).origin === new URL(allowed).origin;
  } catch {
    return false;
  }
}

export const securityPlugin = fp(
  async function security(app, opts: SecurityOptions) {
    // 1) Security headers on every response.
    app.addHook("onSend", async (_req, reply, payload) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("Cross-Origin-Opener-Policy", "same-origin");
      reply.header("Cross-Origin-Resource-Policy", "same-origin");
      reply.header("X-DNS-Prefetch-Control", "off");
      reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
      reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      // API responses must never be cached by shared caches (PHI safety).
      reply.header("Cache-Control", "no-store");
      if (opts.enableHsts) {
        reply.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
      }
      // Fastify does not send X-Powered-By, but strip defensively if a plugin adds it.
      reply.removeHeader("X-Powered-By");
      return payload;
    });

    // 2) CSRF: cookie-authenticated mutations must be same-origin.
    app.addHook("onRequest", async (req) => {
      if (!MUTATING.has(req.method)) return;
      if (req.routeOptions?.config?.public) return;
      if (!isCookieAuth(req.headers as Record<string, unknown>, opts.sessionCookieName)) return;

      const origin = req.headers.origin as string | undefined;
      const referer = req.headers.referer as string | undefined;
      const ok = originMatches(origin ?? referer, opts.webOrigin);
      if (!ok) {
        throw new ForbiddenError("Cross-site request blocked", {
          details: { reason: "csrf_origin_mismatch" },
        });
      }
    });
  },
  { name: "security", dependencies: ["request-context"] },
);
