import { describe, it, expect } from "vitest";
import { can, permissionsFor, Role, Permission, ROLES } from "./tenant.js";

describe("RBAC matrix", () => {
  it("acceptance: clinician cannot submit claims, biller can", () => {
    expect(can("clinician", "claims:submit")).toBe(false);
    expect(can("biller", "claims:submit")).toBe(true);
  });

  it("owner has every permission", () => {
    expect(permissionsFor("owner").length).toBeGreaterThan(0);
    expect(can("owner", "org:manage")).toBe(true);
    expect(can("owner", "claims:submit")).toBe(true);
    expect(can("owner", "notes:sign")).toBe(true);
  });

  it("clinician can sign notes but not manage members", () => {
    expect(can("clinician", "notes:sign")).toBe(true);
    expect(can("clinician", "members:manage")).toBe(false);
  });

  it("frontdesk can manage calls but not sign notes", () => {
    expect(can("frontdesk", "calls:manage")).toBe(true);
    expect(can("frontdesk", "notes:sign")).toBe(false);
  });

  it("role and permission schemas accept known values", () => {
    expect(() => Role.parse("clinician")).not.toThrow();
    expect(() => Role.parse("wizard")).toThrow();
    expect(() => Permission.parse("notes:sign")).not.toThrow();
  });

  it("permissionsFor returns a fresh array (no matrix mutation)", () => {
    for (const r of ROLES) {
      const before = permissionsFor(r).length;
      const copy = permissionsFor(r);
      copy.push(copy[0]!); // mutate the returned array
      expect(permissionsFor(r).length).toBe(before); // matrix is untouched
    }
  });
});
