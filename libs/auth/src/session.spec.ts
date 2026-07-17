import { describe, it, expect } from "vitest";
import { FixedClock } from "@cura/core";
import { AuthError } from "@cura/shared";
import { SessionService, readBearer, DEFAULT_COOKIE_NAME } from "./session.js";

const SECRET = "test-secret-at-least-16-chars-long";

function makeService(clock = new FixedClock("2026-01-01T00:00:00.000Z")) {
  return { svc: new SessionService({ secret: SECRET, clock, ttlSeconds: 3600 }), clock };
}

describe("SessionService", () => {
  it("issues a token that round-trips through verify()", () => {
    const { svc } = makeService();
    const token = svc.issue({ userId: "u1", orgId: "o1", role: "clinician" });
    const claims = svc.verify(token);
    expect(claims.sub).toBe("u1");
    expect(claims.org).toBe("o1");
    expect(claims.role).toBe("clinician");
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("carries no PHI — only ids, role, and timestamps", () => {
    const { svc } = makeService();
    const token = svc.issue({ userId: "u1", orgId: "o1", role: "biller" });
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "org", "role", "sid", "sub"]);
  });

  it("rejects a tampered payload", () => {
    const { svc } = makeService();
    const token = svc.issue({ userId: "u1", orgId: "o1", role: "clinician" });
    const [h, , s] = token.split(".");
    const forged = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    forged.role = "owner";
    const tampered = `${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`;
    expect(() => svc.verify(tampered)).toThrow(AuthError);
  });

  it("rejects a token signed with a different secret", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const a = new SessionService({ secret: SECRET, clock });
    const b = new SessionService({ secret: "another-secret-16-plus-chars!!", clock });
    const token = a.issue({ userId: "u1", orgId: "o1", role: "admin" });
    expect(() => b.verify(token)).toThrow(AuthError);
  });

  it("rejects an expired token", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const svc = new SessionService({ secret: SECRET, clock, ttlSeconds: 60 });
    const token = svc.issue({ userId: "u1", orgId: "o1", role: "clinician" });
    clock.advance(61_000);
    expect(() => svc.verify(token)).toThrow(/expired/i);
  });

  it("rejects malformed tokens", () => {
    const { svc } = makeService();
    expect(() => svc.verify("not-a-token")).toThrow(AuthError);
    expect(() => svc.verify("a.b")).toThrow(AuthError);
    expect(() => svc.verify("a.b.c")).toThrow(AuthError);
  });

  it("refuses a weak secret", () => {
    expect(() => new SessionService({ secret: "short" })).toThrow();
  });

  it("renders and reads the session cookie", () => {
    const { svc } = makeService();
    const token = svc.issue({ userId: "u1", orgId: "o1", role: "clinician" });
    const setCookie = svc.toSetCookie(token);
    expect(setCookie).toContain(`${DEFAULT_COOKIE_NAME}=${token}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(svc.readCookie(`other=x; ${DEFAULT_COOKIE_NAME}=${token}; y=z`)).toBe(token);
    expect(svc.readCookie(undefined)).toBeNull();
    expect(svc.clearCookie()).toContain("Max-Age=0");
  });

  it("adds Secure only when configured", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const secure = new SessionService({ secret: SECRET, clock, secureCookies: true });
    const insecure = new SessionService({ secret: SECRET, clock, secureCookies: false });
    const t = secure.issue({ userId: "u", orgId: "o", role: "admin" });
    expect(secure.toSetCookie(t)).toContain("Secure");
    expect(insecure.toSetCookie(t)).not.toContain("Secure");
  });

  it("emits SameSite=None; Secure for cross-site cookies (Vercel ↔ Railway)", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    // secureCookies deliberately false — None must force Secure on regardless.
    const svc = new SessionService({ secret: SECRET, clock, sameSite: "none", secureCookies: false });
    const t = svc.issue({ userId: "u", orgId: "o", role: "clinician" });
    const setCookie = svc.toSetCookie(t);
    expect(setCookie).toContain("SameSite=None");
    expect(setCookie).toContain("Secure");
    expect(svc.clearCookie()).toContain("SameSite=None");
    expect(svc.clearCookie()).toContain("Secure");
  });
});

describe("readBearer", () => {
  it("extracts a bearer token case-insensitively", () => {
    expect(readBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(readBearer("bearer xyz")).toBe("xyz");
    expect(readBearer("Basic abc")).toBeNull();
    expect(readBearer(undefined)).toBeNull();
  });
});
