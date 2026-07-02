import { systemClock, type Clock } from "@cura/core";
import { AuthService } from "./auth-service.js";
import type { ContextRepos } from "./context.js";
import { DevAuthProvider } from "./dev-auth.js";
import type { AuthProvider } from "./provider.js";
import { SessionService } from "./session.js";

export * from "./session.js";
export * from "./context.js";
export * from "./rbac.js";
export * from "./provider.js";
export * from "./dev-auth.js";
export * from "./workos.js";
export * from "./auth-service.js";

export interface CreateAuthServiceOptions {
  /** HMAC secret for session tokens (e.g. `SESSION_SECRET` or `ENCRYPTION_KEY`). */
  sessionSecret: string;
  /** Repositories used to build the TenantContext (org + user lookups). */
  repos: ContextRepos;
  /**
   * The identity provider. Defaults to the dev provider (seeded user), which is
   * what runs when `AUTH_PROVIDER=mock` / WorkOS is unconfigured.
   */
  provider?: AuthProvider;
  clock?: Clock;
  sessionTtlSeconds?: number;
  secureCookies?: boolean;
  cookieName?: string;
}

/**
 * Assemble an {@link AuthService} from config. The default provider is the dev
 * fallback, so with no WorkOS config the service authenticates the seeded user
 * — exactly the local-dev experience the phase requires.
 */
export function createAuthService(opts: CreateAuthServiceOptions): AuthService {
  const clock = opts.clock ?? systemClock;
  const sessions = new SessionService({
    secret: opts.sessionSecret,
    clock,
    ...(opts.sessionTtlSeconds ? { ttlSeconds: opts.sessionTtlSeconds } : {}),
    ...(opts.secureCookies !== undefined ? { secureCookies: opts.secureCookies } : {}),
    ...(opts.cookieName ? { cookieName: opts.cookieName } : {}),
  });
  return new AuthService({
    sessions,
    repos: opts.repos,
    provider: opts.provider ?? new DevAuthProvider(),
  });
}
