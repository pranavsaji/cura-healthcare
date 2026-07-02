import { z } from "zod";

/** Roles a member can hold within an organization (clinic). */
export const ROLES = ["owner", "admin", "clinician", "frontdesk", "biller"] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

/** Fine-grained permissions checked at the API + row level. */
export const PERMISSIONS = [
  "sessions:manage",
  "notes:read",
  "notes:write",
  "notes:sign",
  "notes:sync",
  "templates:manage",
  "calls:manage",
  "claims:read",
  "claims:submit",
  "audit:read",
  "members:manage",
  "org:manage",
] as const;
export const Permission = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof Permission>;

/** Role → permissions matrix. `owner` implicitly has everything. */
const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    "sessions:manage",
    "notes:read",
    "notes:write",
    "notes:sign",
    "notes:sync",
    "templates:manage",
    "calls:manage",
    "claims:read",
    "claims:submit",
    "audit:read",
    "members:manage",
  ],
  clinician: [
    "sessions:manage",
    "notes:read",
    "notes:write",
    "notes:sign",
    "notes:sync",
    "templates:manage",
  ],
  frontdesk: ["sessions:manage", "calls:manage", "notes:read"],
  biller: ["claims:read", "claims:submit", "notes:read", "audit:read"],
};

/** Whether a role is granted a permission. */
export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

/** All permissions for a role (used when building a TenantContext in Phase 05). */
export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

/** The authorization unit that flows through every request (built in Phase 05). */
export interface TenantContext {
  orgId: string;
  userId: string;
  role: Role;
  permissions: Permission[];
  requestId: string;
}
