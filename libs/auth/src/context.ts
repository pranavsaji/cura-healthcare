import { AuthError, permissionsFor, type Role, type TenantContext } from "@cura/shared";
import type { SessionClaims } from "./session.js";

export type { TenantContext } from "@cura/shared";

/**
 * The minimal repository surface the context builder needs. `@cura/db`'s
 * `Repositories` satisfies it structurally, and tests pass a tiny fake — so the
 * authorization logic is unit-testable without a database.
 */
export interface ContextRepos {
  orgs: { byId(orgId: string): Promise<{ id: string } | null> };
  users: {
    byId(orgId: string, id: string): Promise<{ id: string; orgId: string; role: Role } | null>;
  };
}

/**
 * Build the {@link TenantContext} that flows through every request (CONVENTIONS
 * §2). The DB is the source of truth for the user's role — we re-load it rather
 * than trusting the token's `role` claim, so a role change or a revoked user is
 * enforced immediately. `permissions` is derived from the Phase 01 matrix.
 *
 * Throws {@link AuthError} (401) if the org or user no longer exists or the user
 * does not belong to the org — a stale/forged token can't grant access.
 */
export async function buildTenantContext(
  repos: ContextRepos,
  claims: Pick<SessionClaims, "sub" | "org" | "role">,
  requestId: string,
): Promise<TenantContext> {
  const org = await repos.orgs.byId(claims.org);
  if (!org) throw new AuthError("Session no longer valid");

  const user = await repos.users.byId(claims.org, claims.sub);
  if (!user || user.orgId !== claims.org) throw new AuthError("Session no longer valid");

  const role = user.role; // DB is source of truth, not the token claim
  return {
    orgId: org.id,
    userId: user.id,
    role,
    permissions: permissionsFor(role),
    requestId,
  };
}
