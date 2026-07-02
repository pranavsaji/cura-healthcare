import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AuthError, Role } from "@cura/shared";
import { systemClock, type Clock } from "@cura/core";

/**
 * Stateless session tokens. We issue a compact, HMAC-SHA256–signed JWT (HS256)
 * carrying ONLY identity + role — never PHI (CONVENTIONS §6). Verification is
 * constant-time and rejects tampered or expired tokens. Kept dependency-free
 * (node:crypto) so the auth layer stays L2 with zero vendor SDKs.
 *
 * The same token verifies for HTTP (cookie/bearer) and WebSocket (upgrade), so
 * Phase 06 and Phase 07 share one authentication path.
 */

/** The signed payload. `sub`=userId, `org`=orgId. Times are epoch seconds. */
export const SessionClaims = z.object({
  sub: z.string().min(1),
  org: z.string().min(1),
  role: Role,
  /** issued-at (epoch seconds) */
  iat: z.number().int().nonnegative(),
  /** expires-at (epoch seconds) */
  exp: z.number().int().nonnegative(),
  /** session id — lets us revoke/rotate without decoding PHI */
  sid: z.string().min(1),
});
export type SessionClaims = z.infer<typeof SessionClaims>;

/** Identity the caller wants to mint a session for. */
export interface SessionSubject {
  userId: string;
  orgId: string;
  role: Role;
  /** Optional stable session id; generated if absent. */
  sessionId?: string;
}

export interface SessionServiceOptions {
  /** HMAC signing secret. Must be ≥16 chars; never logged. */
  secret: string;
  /** Injected clock for deterministic tests. */
  clock?: Clock;
  /** Default token lifetime in seconds (default 1h). */
  ttlSeconds?: number;
  /** Cookie name used by {@link toSetCookie}. */
  cookieName?: string;
  /** Emit the `Secure` cookie flag (true in prod / behind TLS). */
  secureCookies?: boolean;
}

const HEADER = { alg: "HS256", typ: "JWT" } as const;
const DEFAULT_TTL = 60 * 60; // 1 hour
export const DEFAULT_COOKIE_NAME = "cura_session";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function b64urlJson(value: unknown): string {
  return b64url(JSON.stringify(value));
}

/** Issues and verifies signed session tokens; renders/reads the session cookie. */
export class SessionService {
  private readonly secret: string;
  private readonly clock: Clock;
  private readonly ttl: number;
  readonly cookieName: string;
  private readonly secureCookies: boolean;

  constructor(opts: SessionServiceOptions) {
    if (!opts.secret || opts.secret.length < 16) {
      throw new Error("SessionService: secret must be at least 16 characters");
    }
    this.secret = opts.secret;
    this.clock = opts.clock ?? systemClock;
    this.ttl = opts.ttlSeconds ?? DEFAULT_TTL;
    this.cookieName = opts.cookieName ?? DEFAULT_COOKIE_NAME;
    this.secureCookies = opts.secureCookies ?? false;
  }

  private sign(signingInput: string): string {
    return createHmac("sha256", this.secret).update(signingInput).digest("base64url");
  }

  /** Mint a signed token for a subject. `ttlSeconds` overrides the default. */
  issue(subject: SessionSubject, ttlSeconds?: number): string {
    const iat = Math.floor(this.clock.nowMs() / 1000);
    const exp = iat + (ttlSeconds ?? this.ttl);
    const claims: SessionClaims = {
      sub: subject.userId,
      org: subject.orgId,
      role: subject.role,
      iat,
      exp,
      sid: subject.sessionId ?? `sess_${iat}_${b64url(subject.userId).slice(0, 8)}`,
    };
    const header = b64urlJson(HEADER);
    const body = b64urlJson(claims);
    const signingInput = `${header}.${body}`;
    return `${signingInput}.${this.sign(signingInput)}`;
  }

  /**
   * Verify a token: signature integrity, structural validity, and expiry.
   * Throws {@link AuthError} on any failure — the message is generic so callers
   * can safely surface it (no internals leak).
   */
  verify(token: string): SessionClaims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new AuthError("Invalid session");
    const [header, body, signature] = parts as [string, string, string];

    const expected = this.sign(`${header}.${body}`);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AuthError("Invalid session");
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      throw new AuthError("Invalid session");
    }
    const parsed = SessionClaims.safeParse(decoded);
    if (!parsed.success) throw new AuthError("Invalid session");

    const nowSec = Math.floor(this.clock.nowMs() / 1000);
    if (parsed.data.exp <= nowSec) throw new AuthError("Session expired");
    return parsed.data;
  }

  /** `Set-Cookie` value that stores the session (HttpOnly, SameSite=Lax). */
  toSetCookie(token: string, maxAgeSeconds?: number): string {
    const maxAge = maxAgeSeconds ?? this.ttl;
    const flags = [
      `${this.cookieName}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
    ];
    if (this.secureCookies) flags.push("Secure");
    return flags.join("; ");
  }

  /** `Set-Cookie` value that clears the session (logout). */
  clearCookie(): string {
    const flags = [`${this.cookieName}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (this.secureCookies) flags.push("Secure");
    return flags.join("; ");
  }

  /** Extract this service's token from a raw `Cookie` header, if present. */
  readCookie(cookieHeader: string | undefined | null): string | null {
    if (!cookieHeader) return null;
    for (const pair of cookieHeader.split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      if (name === this.cookieName) return pair.slice(eq + 1).trim() || null;
    }
    return null;
  }
}

/** Extract a bearer token from an `Authorization` header, if present. */
export function readBearer(authorization: string | undefined | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1]!.trim() : null;
}
