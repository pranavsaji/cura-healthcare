import { describe, it, expect, vi, afterEach } from "vitest";
import { ProviderError, type Role } from "@cura/shared";
import {
  WorkOSAuthProvider,
  HttpWorkOSPort,
  type UserDirectory,
  type WorkOSPort,
  type WorkOSProfile,
} from "./workos.js";
import { DevAuthProvider } from "./dev-auth.js";
import type { AuthProvider } from "./provider.js";

/** A fake directory that records created/updated users. */
function fakeDirectory() {
  const rows = new Map<string, { id: string; externalId: string; role: Role }>();
  let seq = 0;
  const dir: UserDirectory & { rows: typeof rows } = {
    rows,
    async findByExternalId(orgId, externalId) {
      const hit = [...rows.values()].find((r) => r.externalId === externalId);
      return hit ? { id: hit.id } : null;
    },
    async create(orgId, input) {
      const id = `user_${++seq}`;
      rows.set(id, { id, externalId: input.workosUserId, role: input.role });
      return { id };
    },
    async updateRole(orgId, userId, role) {
      const r = rows.get(userId);
      if (r) r.role = role;
    },
  };
  return dir;
}

function makeProvider(profile: WorkOSProfile, dir = fakeDirectory()) {
  const port: WorkOSPort = {
    authorizationUrl: (o) => `https://idp/authorize?client_id=${o.clientId}&state=${o.state}`,
    authenticateWithCode: async () => profile,
  };
  const provider = new WorkOSAuthProvider({
    port,
    directory: dir,
    clientId: "client_1",
    resolveOrgId: async (wo) => (wo === "workos_org_1" ? "o1" : null),
  });
  return { provider, dir };
}

describe("WorkOSAuthProvider", () => {
  it("builds an authorization URL through the port", () => {
    const { provider } = makeProvider({
      userId: "wu1",
      email: "a@x.com",
      name: "A",
      organizationId: "workos_org_1",
      role: "clinician",
    });
    const url = provider.authorizationUrl({ state: "s1", redirectUri: "https://app/cb" });
    expect(url).toContain("client_id=client_1");
    expect(url).toContain("state=s1");
  });

  it("completeLogin reconciles a new user and returns a subject", async () => {
    const { provider, dir } = makeProvider({
      userId: "wu1",
      email: "a@x.com",
      name: "Dr A",
      organizationId: "workos_org_1",
      role: "clinician",
    });
    const subject = await provider.completeLogin("code_1");
    expect(subject).toEqual({ userId: "user_1", orgId: "o1", role: "clinician" });
    expect(dir.rows.size).toBe(1);
  });

  it("is idempotent — replaying the same external user does not duplicate", async () => {
    const { provider, dir } = makeProvider({
      userId: "wu1",
      email: "a@x.com",
      name: "A",
      organizationId: "workos_org_1",
      role: "clinician",
    });
    await provider.syncDirectoryUser({ externalId: "wu1", email: "a@x.com", name: "A", orgId: "o1" });
    await provider.syncDirectoryUser({
      externalId: "wu1",
      email: "a@x.com",
      name: "A",
      orgId: "o1",
      role: "admin",
    });
    expect(dir.rows.size).toBe(1);
    // role updated on the second (idempotent) reconcile
    expect([...dir.rows.values()][0]!.role).toBe("admin");
  });

  it("defaults the role when the profile carries none", async () => {
    const { provider } = makeProvider({
      userId: "wu2",
      email: "b@x.com",
      name: "B",
      organizationId: "workos_org_1",
      role: null,
    });
    const subject = await provider.completeLogin("code");
    expect(subject.role).toBe("clinician"); // default
  });

  it("rejects a profile with no organization", async () => {
    const { provider } = makeProvider({
      userId: "wu3",
      email: "c@x.com",
      name: "C",
      organizationId: null,
      role: null,
    });
    await expect(provider.completeLogin("code")).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects an unmapped organization", async () => {
    const { provider } = makeProvider({
      userId: "wu4",
      email: "d@x.com",
      name: "D",
      organizationId: "unknown_org",
      role: null,
    });
    await expect(provider.completeLogin("code")).rejects.toBeInstanceOf(ProviderError);
  });
});

// Contract: both providers satisfy the AuthProvider surface they advertise.
describe("AuthProvider contract", () => {
  const providers: AuthProvider[] = [
    new DevAuthProvider(),
    makeProvider({
      userId: "w",
      email: "e@x.com",
      name: "E",
      organizationId: "workos_org_1",
      role: "clinician",
    }).provider,
  ];

  it("dev exposes devSubject; workos exposes SSO+SCIM", () => {
    const [dev, workos] = providers;
    expect(dev!.kind).toBe("dev");
    expect(typeof dev!.devSubject).toBe("function");
    expect(dev!.completeLogin).toBeUndefined();

    expect(workos!.kind).toBe("workos");
    expect(typeof workos!.completeLogin).toBe("function");
    expect(typeof workos!.syncDirectoryUser).toBe("function");
    expect(workos!.devSubject).toBeUndefined();
  });
});

describe("HttpWorkOSPort", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a spec-shaped authorization URL", () => {
    const port = new HttpWorkOSPort("sk_test");
    const url = port.authorizationUrl({
      clientId: "client_1",
      state: "s",
      redirectUri: "https://app/cb",
      organizationId: "org_1",
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://api.workos.com");
    expect(parsed.searchParams.get("client_id")).toBe("client_1");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app/cb");
    expect(parsed.searchParams.get("organization")).toBe("org_1");
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });

  it("maps a successful token response to a profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          profile: {
            id: "wu_1",
            email: "a@x.com",
            first_name: "Sam",
            last_name: "Rivera",
            organization_id: "workos_org_1",
            role: { slug: "clinician" },
          },
        }),
      })),
    );
    const port = new HttpWorkOSPort("sk_test");
    const profile = await port.authenticateWithCode("code_1");
    expect(profile).toEqual({
      userId: "wu_1",
      email: "a@x.com",
      name: "Sam Rivera",
      organizationId: "workos_org_1",
      role: "clinician",
    });
  });

  it("throws a ProviderError on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    const port = new HttpWorkOSPort("sk_test");
    await expect(port.authenticateWithCode("bad")).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws when the response carries no profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const port = new HttpWorkOSPort("sk_test");
    await expect(port.authenticateWithCode("x")).rejects.toBeInstanceOf(ProviderError);
  });
});
