import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { ROLES, type Permission, type Role, can } from "@cura/shared";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform, MemoryStoreFactory, type Platform } from "../src/platform/index.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../src/platform/directory.js";

/**
 * Phase 16 — the authz matrix. The single most important security test: it
 * enumerates the FULL (role × protected endpoint) space and asserts the gateway's
 * decision matches the RBAC matrix in `@cura/shared` — no privilege escalation on
 * any route. Because expectations are derived from `can(role, permission)` (the
 * source of truth), a drifting route guard OR a widened matrix fails this test.
 *
 * Valid bodies are always sent so that body validation (400) never preempts the
 * RBAC decision — we are testing authorization, not input parsing. Non-existent
 * resource ids are fine: an authorized caller falls through the guard to a 404,
 * which still proves "not forbidden".
 */
const SECRET = "test-secret-at-least-16-chars-long";

/** Every protected route with the permission it requires + a valid sample request. */
interface RouteCase {
  name: string;
  method: NonNullable<InjectOptions["method"]>;
  url: string;
  permission: Permission;
  payload?: Record<string, unknown>;
}

const ROUTES: RouteCase[] = [
  { name: "list templates", method: "GET", url: "/templates", permission: "notes:read" },
  { name: "list sessions", method: "GET", url: "/sessions", permission: "sessions:manage" },
  {
    name: "create session",
    method: "POST",
    url: "/sessions",
    permission: "sessions:manage",
    payload: { clientLabel: "Client A" },
  },
  { name: "get session", method: "GET", url: "/sessions/nope", permission: "notes:read" },
  { name: "consent session", method: "POST", url: "/sessions/nope/consent", permission: "sessions:manage" },
  {
    name: "presign upload",
    method: "POST",
    url: "/sessions/nope/upload-url",
    permission: "sessions:manage",
    payload: { contentType: "audio/webm" },
  },
  {
    name: "upload audio",
    method: "POST",
    url: "/sessions/nope/audio",
    permission: "sessions:manage",
    payload: { audio: "AAAA" },
  },
  { name: "generate note", method: "POST", url: "/sessions/nope/generate", permission: "notes:write" },
  { name: "get note", method: "GET", url: "/notes/nope", permission: "notes:read" },
  {
    name: "edit note section",
    method: "PATCH",
    url: "/notes/nope/section",
    permission: "notes:write",
    payload: { sectionKey: "s", content: "c" },
  },
  { name: "sign note", method: "POST", url: "/notes/nope/sign", permission: "notes:sign" },
  { name: "sync note", method: "POST", url: "/notes/nope/sync", permission: "notes:sync" },
  { name: "list integrations", method: "GET", url: "/integrations", permission: "notes:read" },
  {
    name: "connect integration",
    method: "POST",
    url: "/integrations/connect",
    permission: "org:manage",
    payload: { provider: "generic-fhir" },
  },
  { name: "list agent runs", method: "GET", url: "/agent-runs", permission: "audit:read" },
  { name: "list audit", method: "GET", url: "/audit", permission: "audit:read" },
  { name: "verify audit chain", method: "GET", url: "/audit/verify", permission: "audit:read" },
  { name: "run inspector", method: "GET", url: "/runs/some-resource", permission: "audit:read" },
];

const PUBLIC_ROUTES = ["/health", "/ready", "/openapi.json"];

function token(platform: Platform, role: Role): string {
  return platform.auth.issueSession({ userId: DEV_USER_IDS[role], orgId: DEV_ORG_ID, role });
}

describe("Phase 16 · authz matrix (role × endpoint)", () => {
  let app: FastifyInstance;
  let platform: Platform;

  beforeAll(async () => {
    // Prod-like: dev fallback OFF (unauth → 401); rate limit high so the matrix
    // sweep never trips 429.
    platform = createMemoryPlatform({
      sessionSecret: SECRET,
      devFallback: false,
      rateLimitPerMin: 100_000,
    });
    app = await buildApp(platform);
  });
  afterAll(async () => await app.close());

  // The full sweep: every (role, route) pair. 5 roles × N routes.
  for (const role of ROLES) {
    for (const route of ROUTES) {
      const allowed = can(role, route.permission);
      it(`${role} ${allowed ? "MAY" : "may NOT"} ${route.name} (${route.permission})`, async () => {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: { authorization: `Bearer ${token(platform, role)}` },
          ...(route.payload !== undefined ? { payload: route.payload } : {}),
        });
        if (allowed) {
          // Passed the guard: anything but 403 (typically 200/404 for fake ids).
          expect(res.statusCode, `${role} should NOT be forbidden on ${route.url}`).not.toBe(403);
          expect(res.statusCode).not.toBe(401);
        } else {
          expect(res.statusCode, `${role} should be forbidden on ${route.url}`).toBe(403);
          expect(res.json().code).toBe("forbidden");
        }
      });
    }
  }

  it("rejects EVERY protected route when unauthenticated (401, no leak)", async () => {
    for (const route of ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        ...(route.payload !== undefined ? { payload: route.payload } : {}),
      });
      expect(res.statusCode, `${route.url} unauthenticated`).toBe(401);
      expect(JSON.stringify(res.json())).not.toMatch(/stack|Error:|at \//i);
    }
  });

  it("serves public routes with no auth", async () => {
    for (const url of PUBLIC_ROUTES) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
    }
  });
});

describe("Phase 16 · cross-tenant isolation (no data crosses orgId)", () => {
  it("a store scoped to org B never sees org A's rows", async () => {
    const factory = new MemoryStoreFactory();
    const orgA = "11111111-1111-4000-8000-00000000000a";
    const orgB = "22222222-2222-4000-8000-00000000000b";

    const storeA = await factory.forTenant({ orgId: orgA, userId: "user-a" });
    const created = await storeA.createSession({ clientLabel: "PHI-A", source: "live" });
    expect(created.orgId).toBe(orgA);

    // Org B gets a *different* dataset — org A's session id is invisible.
    const storeB = await factory.forTenant({ orgId: orgB, userId: "user-b" });
    expect(await storeB.getSession(created.id)).toBeUndefined();
    expect((await storeB.listSessions()).every((s) => s.orgId === orgB)).toBe(true);

    // And org A still sees only its own, all stamped with orgA.
    const listedA = await storeA.listSessions();
    expect(listedA.length).toBeGreaterThan(0);
    expect(listedA.every((s) => s.orgId === orgA)).toBe(true);
  });

  it("every domain row carries the tenant's orgId (no global path)", async () => {
    const factory = new MemoryStoreFactory();
    const org = "33333333-3333-4000-8000-00000000000c";
    const store = await factory.forTenant({ orgId: org, userId: "user-c" });
    const session = await store.createSession({ clientLabel: "PHI", source: "live" });
    const templates = await store.listTemplates();
    expect(session.orgId).toBe(org);
    expect(templates.every((t) => t.orgId === org)).toBe(true);
  });
});
