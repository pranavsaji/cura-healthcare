import { ProviderError, type Role } from "@cura/shared";
import type { AuthProvider, AuthorizationOptions, DirectoryUser } from "./provider.js";
import type { SessionSubject } from "./session.js";

/**
 * The WorkOS vendor boundary. The provider talks only to this port, never to a
 * vendor SDK (CONVENTIONS §2), so it is fully testable with a fake and the real
 * network impl ({@link HttpWorkOSPort}) can evolve independently.
 */
export interface WorkOSPort {
  /** Build the hosted SSO authorization URL. */
  authorizationUrl(opts: AuthorizationOptions & { clientId: string }): string;
  /** Exchange an authorization code for the authenticated profile. */
  authenticateWithCode(code: string): Promise<WorkOSProfile>;
}

export interface WorkOSProfile {
  /** WorkOS user id (stable external id). */
  userId: string;
  email: string;
  name: string;
  /** WorkOS organization id the user authenticated into, if any. */
  organizationId: string | null;
  /** Role slug from the WorkOS org membership, if configured. */
  role: Role | null;
}

/**
 * Persistence port for reconciling directory/SSO users into `users`. An adapter
 * over `@cura/db`'s `UserRepo` satisfies it in the app; tests use a fake.
 * Idempotent by (orgId, externalId) so SCIM events can be replayed safely.
 */
export interface UserDirectory {
  findByExternalId(orgId: string, externalId: string): Promise<{ id: string } | null>;
  create(
    orgId: string,
    input: { email: string; name: string; role: Role; workosUserId: string },
  ): Promise<{ id: string }>;
  /** Update the mapped role on an existing user (no-op if unsupported yet). */
  updateRole?(orgId: string, userId: string, role: Role): Promise<void>;
}

export interface WorkOSAuthProviderOptions {
  port: WorkOSPort;
  directory: UserDirectory;
  clientId: string;
  /** Map a WorkOS organization id → the cura org id. */
  resolveOrgId(workosOrgId: string): Promise<string | null>;
  /** Role assigned when the directory/SSO profile carries none. */
  defaultRole?: Role;
  /**
   * Cura org to place users in when the AuthKit profile carries no WorkOS
   * organization (e.g. plain email/password sign-ups with no org membership).
   * Without this, an org-less login is rejected.
   */
  defaultOrgId?: string;
}

/**
 * WorkOS-backed identity: hosted SSO login/callback + SCIM directory reconcile.
 * SCIM is scaffolded here and covered by a contract test; full webhook wiring
 * lands with the app that consumes it.
 */
export class WorkOSAuthProvider implements AuthProvider {
  readonly kind = "workos" as const;
  private readonly opts: WorkOSAuthProviderOptions;
  private readonly defaultRole: Role;

  constructor(opts: WorkOSAuthProviderOptions) {
    this.opts = opts;
    this.defaultRole = opts.defaultRole ?? "clinician";
  }

  authorizationUrl(opts: AuthorizationOptions): string {
    return this.opts.port.authorizationUrl({ ...opts, clientId: this.opts.clientId });
  }

  async completeLogin(code: string): Promise<SessionSubject> {
    const profile = await this.opts.port.authenticateWithCode(code);
    // AuthKit users may authenticate without a WorkOS organization (email/
    // password with no org membership). Map an org-bearing profile through the
    // org directory; fall back to the configured default org otherwise.
    const orgId = profile.organizationId
      ? await this.opts.resolveOrgId(profile.organizationId)
      : this.opts.defaultOrgId ?? null;
    if (!orgId) throw new ProviderError("Unknown organization for SSO login");

    const role = profile.role ?? this.defaultRole;
    const { userId } = await this.reconcile({
      externalId: profile.userId,
      email: profile.email,
      name: profile.name,
      orgId,
      role,
    });
    return { userId, orgId, role };
  }

  async syncDirectoryUser(user: DirectoryUser): Promise<{ userId: string; orgId: string }> {
    const role = user.role ?? this.defaultRole;
    const { userId } = await this.reconcile({ ...user, role });
    return { userId, orgId: user.orgId };
  }

  /** Idempotent upsert of a directory/SSO user into `users`. */
  private async reconcile(u: {
    externalId: string;
    email: string;
    name: string;
    orgId: string;
    role: Role;
  }): Promise<{ userId: string }> {
    const existing = await this.opts.directory.findByExternalId(u.orgId, u.externalId);
    if (existing) {
      await this.opts.directory.updateRole?.(u.orgId, existing.id, u.role);
      return { userId: existing.id };
    }
    const created = await this.opts.directory.create(u.orgId, {
      email: u.email,
      name: u.name,
      role: u.role,
      workosUserId: u.externalId,
    });
    return { userId: created.id };
  }
}

/**
 * Real WorkOS network adapter for AuthKit (User Management API). Used in
 * production; never exercised in unit tests. The hosted AuthKit page handles
 * email/password + social login, so no SAML/IdP connection is required. Kept
 * behind {@link WorkOSPort} so no other layer depends on WorkOS wire details.
 *
 * - authorize: `GET /user_management/authorize?provider=authkit` → hosted login
 * - authenticate: `POST /user_management/authenticate` (code → user + tokens)
 */
export class HttpWorkOSPort implements WorkOSPort {
  constructor(
    private readonly apiKey: string,
    private readonly clientId: string,
    private readonly baseUrl = "https://api.workos.com",
  ) {}

  authorizationUrl(opts: AuthorizationOptions & { clientId: string }): string {
    const url = new URL("/user_management/authorize", this.baseUrl);
    url.searchParams.set("client_id", opts.clientId);
    url.searchParams.set("redirect_uri", opts.redirectUri);
    url.searchParams.set("response_type", "code");
    // `authkit` routes to the hosted login page, which auto-detects the user's
    // available auth methods (password, social, SSO) and picks the right flow.
    url.searchParams.set("provider", "authkit");
    url.searchParams.set("state", opts.state);
    if (opts.organizationId) url.searchParams.set("organization_id", opts.organizationId);
    return url.toString();
  }

  async authenticateWithCode(code: string): Promise<WorkOSProfile> {
    const res = await fetch(new URL("/user_management/authenticate", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.apiKey,
        grant_type: "authorization_code",
        code,
      }),
    });
    if (!res.ok) {
      throw new ProviderError("WorkOS authentication failed", {
        details: { status: res.status },
      });
    }
    const data = (await res.json()) as {
      user?: {
        id: string;
        email: string;
        first_name?: string | null;
        last_name?: string | null;
      };
      organization_id?: string | null;
      role?: { slug?: string } | string | null;
    };
    const u = data.user;
    if (!u) throw new ProviderError("WorkOS returned no user");
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
    const roleSlug = typeof data.role === "string" ? data.role : data.role?.slug;
    return {
      userId: u.id,
      email: u.email,
      name,
      organizationId: data.organization_id ?? null,
      role: (roleSlug as Role | undefined) ?? null,
    };
  }
}
