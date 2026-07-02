import { AuthError, type TenantContext } from "@cura/shared";
import { buildTenantContext, type ContextRepos } from "./context.js";
import type { AuthProvider } from "./provider.js";
import { SessionService, type SessionClaims, type SessionSubject } from "./session.js";

export interface AuthServiceOptions {
  sessions: SessionService;
  repos: ContextRepos;
  provider: AuthProvider;
}

/** The identity fields the context builder needs, in claim shape. */
type ContextClaims = Pick<SessionClaims, "sub" | "org" | "role">;

/**
 * The transport-agnostic entry point used by both the HTTP gateway (Phase 06)
 * and the WS hub (Phase 07). Given a session token it returns a fully-built
 * {@link TenantContext}; with no token it falls back to the dev subject when the
 * provider supports it (local dev / tests), otherwise it rejects.
 */
export class AuthService {
  readonly sessions: SessionService;
  private readonly repos: ContextRepos;
  readonly provider: AuthProvider;

  constructor(opts: AuthServiceOptions) {
    this.sessions = opts.sessions;
    this.repos = opts.repos;
    this.provider = opts.provider;
  }

  /**
   * Verify `token` (or fall back to the dev subject) and build the request's
   * {@link TenantContext}. Throws {@link AuthError} (→ 401) when there is no
   * valid credential.
   */
  async authenticate(token: string | null | undefined, requestId: string): Promise<TenantContext> {
    const claims: ContextClaims = token ? this.sessions.verify(token) : await this.devFallback();
    return buildTenantContext(this.repos, claims, requestId);
  }

  /** Mint a session token for a subject (called after a successful login). */
  issueSession(subject: SessionSubject, ttlSeconds?: number): string {
    return this.sessions.issue(subject, ttlSeconds);
  }

  private async devFallback(): Promise<ContextClaims> {
    if (!this.provider.devSubject) throw new AuthError();
    const s = await this.provider.devSubject();
    return { sub: s.userId, org: s.orgId, role: s.role };
  }
}
