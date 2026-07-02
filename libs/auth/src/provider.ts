import type { Role } from "@cura/shared";
import type { SessionSubject } from "./session.js";

/**
 * Identity providers are swappable behind this interface (CONVENTIONS §2): a
 * `dev` provider (zero external config) and a `workos` provider (SSO + SCIM),
 * selected by config. Apps never import a vendor SDK — they depend only on this
 * port, so a third vertical or a different IdP is a new implementation, not new
 * app code.
 */
export interface AuthProvider {
  readonly kind: "dev" | "workos";

  /**
   * DEV fallback: a ready-to-use subject for the seeded user, requiring no
   * external login. Present only on the dev provider; the API uses it when no
   * session token is presented and no real IdP is configured.
   */
  devSubject?(): Promise<SessionSubject>;

  /** SSO: the URL to redirect the browser to, to begin an authorization flow. */
  authorizationUrl?(opts: AuthorizationOptions): string;

  /**
   * SSO: exchange the callback `code` for a verified subject, upserting the
   * user into `users` so a `TenantContext` can be built for them.
   */
  completeLogin?(code: string): Promise<SessionSubject>;

  /**
   * SCIM / Directory Sync: reconcile a directory user into `users` with the
   * mapped role. Returns the persisted ids. Idempotent (safe to replay events).
   */
  syncDirectoryUser?(user: DirectoryUser): Promise<{ userId: string; orgId: string }>;
}

export interface AuthorizationOptions {
  /** CSRF/replay guard echoed back on the callback. */
  state: string;
  /** Where WorkOS redirects after auth (must be pre-registered). */
  redirectUri: string;
  /** Optional org hint to route the SSO connection. */
  organizationId?: string;
}

/** A user as reported by the directory (WorkOS SCIM), mapped to a cura org. */
export interface DirectoryUser {
  /** Stable external id from the directory (WorkOS user id). */
  externalId: string;
  email: string;
  name: string;
  /** Mapped cura org id. */
  orgId: string;
  /** Mapped role; defaults to `clinician` when the group mapping is unset. */
  role?: Role;
}
