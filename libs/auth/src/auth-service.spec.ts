import { describe, it, expect } from "vitest";
import { FixedClock } from "@cura/core";
import { AuthError, type Role } from "@cura/shared";
import { buildTenantContext, type ContextRepos } from "./context.js";
import { DevAuthProvider } from "./dev-auth.js";
import { WorkOSAuthProvider } from "./workos.js";
import { createAuthService } from "./index.js";

const SECRET = "test-secret-at-least-16-chars-long";

/** In-memory repos implementing the ContextRepos surface. */
function fakeRepos(seed: { orgId: string; users: Array<{ id: string; role: Role }> }): ContextRepos {
  const users = new Map(seed.users.map((u) => [u.id, u]));
  return {
    orgs: {
      async byId(orgId) {
        return orgId === seed.orgId ? { id: orgId } : null;
      },
    },
    users: {
      async byId(orgId, id) {
        if (orgId !== seed.orgId) return null;
        const u = users.get(id);
        return u ? { id: u.id, orgId, role: u.role } : null;
      },
    },
  };
}

describe("buildTenantContext", () => {
  const repos = fakeRepos({ orgId: "o1", users: [{ id: "u1", role: "clinician" }] });

  it("builds a context with permissions derived from the DB role", async () => {
    const ctx = await buildTenantContext(repos, { sub: "u1", org: "o1", role: "owner" }, "req_1");
    // Token claimed `owner` but DB says clinician — DB wins.
    expect(ctx.role).toBe("clinician");
    expect(ctx.permissions).toContain("notes:sign");
    expect(ctx.permissions).not.toContain("claims:submit");
    expect(ctx.requestId).toBe("req_1");
  });

  it("rejects an unknown org or user", async () => {
    await expect(
      buildTenantContext(repos, { sub: "u1", org: "nope", role: "clinician" }, "r"),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      buildTenantContext(repos, { sub: "ghost", org: "o1", role: "clinician" }, "r"),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("AuthService", () => {
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const repos = fakeRepos({
    orgId: "o1",
    users: [
      { id: "u1", role: "clinician" },
      { id: "admin1", role: "admin" },
    ],
  });

  it("authenticates a valid token into a TenantContext", async () => {
    const auth = createAuthService({
      sessionSecret: SECRET,
      repos,
      clock,
      provider: new DevAuthProvider({ userId: "u1", orgId: "o1", role: "clinician" }),
    });
    const token = auth.issueSession({ userId: "u1", orgId: "o1", role: "clinician" });
    const ctx = await auth.authenticate(token, "req_1");
    expect(ctx.userId).toBe("u1");
    expect(ctx.role).toBe("clinician");
  });

  it("falls back to the seeded dev subject when no token is presented", async () => {
    const auth = createAuthService({
      sessionSecret: SECRET,
      repos,
      clock,
      provider: new DevAuthProvider({ userId: "admin1", orgId: "o1", role: "admin" }),
    });
    const ctx = await auth.authenticate(null, "req_2");
    expect(ctx.userId).toBe("admin1");
    expect(ctx.role).toBe("admin");
    expect(ctx.permissions).toContain("claims:submit");
  });

  it("rejects a missing token when the provider has no dev fallback", async () => {
    // A WorkOS provider (real IdP) exposes no devSubject.
    const workos = new WorkOSAuthProvider({
      clientId: "client_1",
      port: {
        authorizationUrl: () => "https://example.com",
        authenticateWithCode: async () => {
          throw new Error("unused");
        },
      },
      directory: {
        findByExternalId: async () => null,
        create: async () => ({ id: "x" }),
      },
      resolveOrgId: async () => "o1",
    });
    const auth = createAuthService({ sessionSecret: SECRET, repos, clock, provider: workos });
    await expect(auth.authenticate(null, "req_3")).rejects.toBeInstanceOf(AuthError);
  });
});
