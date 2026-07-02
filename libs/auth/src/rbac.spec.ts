import { describe, it, expect } from "vitest";
import {
  ForbiddenError,
  PERMISSIONS,
  ROLES,
  can,
  permissionsFor,
  type Permission,
  type Role,
  type TenantContext,
} from "@cura/shared";
import {
  assertPermission,
  assertRole,
  hasPermission,
  hasRole,
  requirePermission,
  requireRole,
} from "./rbac.js";

function ctxFor(role: Role): TenantContext {
  return {
    orgId: "o1",
    userId: "u1",
    role,
    permissions: permissionsFor(role),
    requestId: "req_1",
  };
}

describe("RBAC guards", () => {
  // Exhaustive matrix check: every role × permission cell must match `can()`.
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      it(`${role} ${can(role, permission) ? "has" : "lacks"} ${permission}`, () => {
        const ctx = ctxFor(role);
        expect(hasPermission(ctx, permission as Permission)).toBe(can(role, permission));
      });
    }
  }

  it("clinician cannot submit claims; biller can (acceptance)", () => {
    const guard = requirePermission("claims:submit");
    expect(() => guard(ctxFor("clinician"))).toThrow(ForbiddenError);
    expect(() => guard(ctxFor("biller"))).not.toThrow();
  });

  it("owner holds every permission", () => {
    const ctx = ctxFor("owner");
    for (const p of PERMISSIONS) expect(hasPermission(ctx, p as Permission)).toBe(true);
  });

  it("assertPermission attaches the required permission in details", () => {
    try {
      assertPermission(ctxFor("frontdesk"), "claims:submit");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).details).toEqual({ required: "claims:submit" });
    }
  });

  it("role guards allow/deny by role", () => {
    expect(hasRole(ctxFor("admin"), "admin", "owner")).toBe(true);
    expect(hasRole(ctxFor("clinician"), "admin")).toBe(false);
    expect(() => assertRole(ctxFor("clinician"), "admin", "owner")).toThrow(ForbiddenError);
    expect(() => requireRole("clinician")(ctxFor("clinician"))).not.toThrow();
  });
});
