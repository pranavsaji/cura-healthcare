import type { FastifyReply, FastifyRequest } from "fastify";
import type { TenantContext } from "@cura/shared";
import type { Telemetry } from "@cura/telemetry";
import type { Platform } from "../platform/index.js";

/**
 * Fastify type augmentation for the gateway's cross-cutting decorations:
 * the shared {@link Platform} on the instance and the per-request
 * {@link TenantContext}. Kept in one place so every plugin/route sees the same
 * types (CONVENTIONS §3 — typed everywhere).
 */
declare module "fastify" {
  interface FastifyInstance {
    platform: Platform;
    /** Telemetry sink (spans + RED metrics); noop unless OTLP/memory configured. */
    telemetry: Telemetry;
  }
  interface FastifyRequest {
    /** Set by the auth plugin on authenticated routes; null on public routes. */
    tenant: TenantContext | null;
  }
  interface FastifyContextConfig {
    /** Mark a route as public (skips authentication). */
    public?: boolean;
  }
}

/** Read the tenant off a request, asserting it was authenticated. */
export function tenantOf(req: FastifyRequest): TenantContext {
  if (!req.tenant) {
    // Programmer error: a protected handler ran without the auth plugin.
    throw new Error("tenant context missing — route is not behind the auth plugin");
  }
  return req.tenant;
}

/** Extract the session token from cookie or Authorization header. */
export function readToken(req: FastifyRequest, cookieName: string): string | null {
  const cookie = req.headers.cookie;
  if (cookie) {
    for (const pair of cookie.split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      if (pair.slice(0, eq).trim() === cookieName) return pair.slice(eq + 1).trim() || null;
    }
  }
  const auth = req.headers.authorization;
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1]!.trim();
  }
  return null;
}

/** Type helper for reply chaining in handlers. */
export type Reply = FastifyReply;
