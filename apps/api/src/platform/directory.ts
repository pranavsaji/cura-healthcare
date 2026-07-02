import { SEED_IDS } from "@cura/db";
import { ROLES, type Role } from "@cura/shared";
import type { ContextRepos } from "@cura/auth";

/**
 * Stable dev user ids, one per role, all in the seeded org. Lets the dev auth
 * fallback and tests build a real {@link TenantContext} for any role without a
 * database. The `admin` and `clinician` ids match the Phase 03 seed so the same
 * ids work against Postgres too.
 */
export const DEV_ORG_ID = SEED_IDS.org;
export const DEV_USER_IDS: Record<Role, string> = {
  owner: "00000000-0000-4000-8000-0000000000a1",
  admin: SEED_IDS.admin,
  clinician: SEED_IDS.clinician,
  frontdesk: "00000000-0000-4000-8000-0000000000a4",
  biller: "00000000-0000-4000-8000-0000000000a5",
};

/**
 * In-memory {@link ContextRepos} for the dev/test platform: the seeded org plus
 * one user per role. Mirrors the shape `@cura/db`'s repos expose to the auth
 * layer, so swapping to Postgres changes nothing for the context builder.
 */
export function createDevDirectory(orgId: string = DEV_ORG_ID): ContextRepos {
  const users = new Map<string, { id: string; orgId: string; role: Role }>();
  for (const role of ROLES) {
    const id = DEV_USER_IDS[role];
    users.set(id, { id, orgId, role });
  }
  return {
    orgs: {
      async byId(id) {
        return id === orgId ? { id } : null;
      },
    },
    users: {
      async byId(reqOrgId, id) {
        if (reqOrgId !== orgId) return null;
        return users.get(id) ?? null;
      },
    },
  };
}
