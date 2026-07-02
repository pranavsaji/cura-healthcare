import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { FixedClock } from "@cura/core";
import type { Role } from "@cura/shared";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform, type Platform } from "../src/platform/index.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../src/platform/directory.js";

/**
 * Auth + RBAC + rate-limit behavior of the gateway. Uses a "prod-like" platform
 * (dev fallback OFF) so unauthenticated requests are rejected and we drive routes
 * with minted session tokens per role.
 */
const SECRET = "test-secret-at-least-16-chars-long";

function tokenFor(platform: Platform, role: Role): string {
  return platform.auth.issueSession({ userId: DEV_USER_IDS[role], orgId: DEV_ORG_ID, role });
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("gateway auth + RBAC", () => {
  let app: FastifyInstance;
  let platform: Platform;

  beforeAll(async () => {
    platform = createMemoryPlatform({ sessionSecret: SECRET, devFallback: false });
    app = await buildApp(platform);
  });
  afterAll(async () => await app.close());

  it("rejects an unauthenticated protected route with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/templates" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("unauthorized");
    // No stack / internals leaked.
    expect(JSON.stringify(res.json())).not.toMatch(/stack|Error:/i);
  });

  it("allows public routes without auth", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/openapi.json" })).statusCode).toBe(200);
  });

  it("accepts a valid token and returns the caller's identity", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: auth(tokenFor(platform, "clinician")),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("clinician");
    expect(res.json().permissions).toContain("notes:sign");
  });

  it("rejects a tampered token with 401", async () => {
    const token = tokenFor(platform, "admin");
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    const res = await app.inject({ method: "GET", url: "/templates", headers: auth(tampered) });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const shortLived = createMemoryPlatform({ sessionSecret: SECRET, devFallback: false, clock });
    const shortApp = await buildApp(shortLived);
    const token = shortLived.auth.issueSession(
      { userId: DEV_USER_IDS.admin, orgId: DEV_ORG_ID, role: "admin" },
      1,
    );
    clock.advance(2000);
    const res = await shortApp.inject({ method: "GET", url: "/templates", headers: auth(token) });
    expect(res.statusCode).toBe(401);
    await shortApp.close();
  });

  it("enforces the permission matrix: clinician 403, biller 200 on /agent-runs", async () => {
    const clinician = await app.inject({
      method: "GET",
      url: "/agent-runs",
      headers: auth(tokenFor(platform, "clinician")),
    });
    expect(clinician.statusCode).toBe(403);
    expect(clinician.json().code).toBe("forbidden");

    const biller = await app.inject({
      method: "GET",
      url: "/agent-runs",
      headers: auth(tokenFor(platform, "biller")),
    });
    expect(biller.statusCode).toBe(200);
  });

  it("403s a clinician on an org-manage route (integrations/connect)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/integrations/connect",
      headers: auth(tokenFor(platform, "clinician")),
      payload: { provider: "generic-fhir" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("dev-login is disabled when the dev provider is off", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { role: "admin" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("gateway dev-login (dev provider on)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(createMemoryPlatform({ sessionSecret: SECRET }));
  });
  afterAll(async () => await app.close());

  it("sets an HttpOnly session cookie and authenticates subsequent calls", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { role: "biller" },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers["set-cookie"] as string;
    expect(setCookie).toMatch(/cura_session=/);
    expect(setCookie).toMatch(/HttpOnly/);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: setCookie.split(";")[0]! },
    });
    expect(me.json().role).toBe("biller");
  });
});

describe("gateway rate limiting", () => {
  it("returns 429 once the per-minute limit is exceeded", async () => {
    const platform = createMemoryPlatform({ sessionSecret: SECRET, rateLimitPerMin: 3 });
    const app = await buildApp(platform);
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/templates" });
      results.push(res.statusCode);
    }
    expect(results.filter((s) => s === 200).length).toBe(3);
    const limited = results.filter((s) => s === 429);
    expect(limited.length).toBe(2);

    const last = await app.inject({ method: "GET", url: "/templates" });
    expect(last.json().code).toBe("rate_limited");
    expect(last.headers["retry-after"]).toBeDefined();
    await app.close();
  });
});
