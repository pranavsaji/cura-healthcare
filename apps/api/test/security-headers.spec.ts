import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform } from "../src/platform/index.js";

/**
 * Phase 16 — security headers, CORS lockdown, and CSRF. Proves the cross-cutting
 * controls are present on every response and that cookie-authenticated mutations
 * are same-origin-gated.
 */
const SECRET = "test-secret-at-least-16-chars-long";
const WEB_ORIGIN = "https://app.example.com";

describe("Phase 16 · security headers", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(
      createMemoryPlatform({ sessionSecret: SECRET, webOrigin: WEB_ORIGIN, secureCookies: true }),
    );
  });
  afterAll(async () => await app.close());

  it("sets a locked-down header set on every response (incl. public routes)", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sends HSTS when TLS/prod is assumed", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  });

  it("omits HSTS in plain dev (no secure cookies, not prod)", async () => {
    const dev = await buildApp(createMemoryPlatform({ sessionSecret: SECRET, secureCookies: false }));
    const res = await dev.inject({ method: "GET", url: "/health" });
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    await dev.close();
  });

  it("CORS reflects only the configured origin", async () => {
    const good = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: WEB_ORIGIN },
    });
    expect(good.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);

    const evil = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });
    expect(evil.headers["access-control-allow-origin"]).not.toBe("https://evil.example.com");
  });
});

describe("Phase 16 · CSRF (cookie-auth mutations are same-origin gated)", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    // Dev provider ON so we can obtain a real session cookie via dev-login.
    app = await buildApp(createMemoryPlatform({ sessionSecret: SECRET, webOrigin: WEB_ORIGIN }));
    const login = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      headers: { origin: WEB_ORIGIN },
      payload: { role: "admin" },
    });
    cookie = (login.headers["set-cookie"] as string).split(";")[0]!;
  });
  afterAll(async () => await app.close());

  it("blocks a cookie-auth mutation with no/foreign Origin (403 csrf)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { cookie, origin: "https://evil.example.com" },
      payload: { clientLabel: "X" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().details?.reason).toBe("csrf_origin_mismatch");
  });

  it("allows a cookie-auth mutation from the same origin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { cookie, origin: WEB_ORIGIN },
      payload: { clientLabel: "X" },
    });
    expect(res.statusCode).not.toBe(403);
  });

  it("exempts bearer-token mutations (not CSRF-able) even with no Origin", async () => {
    const token = app.platform.auth.issueSession({
      userId: "00000000-0000-4000-8000-0000000000a1",
      orgId: (await import("../src/platform/directory.js")).DEV_ORG_ID,
      role: "owner",
    });
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { authorization: `Bearer ${token}` },
      payload: { clientLabel: "X" },
    });
    expect(res.statusCode).not.toBe(403);
  });
});
