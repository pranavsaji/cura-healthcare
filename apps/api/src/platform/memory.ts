import { createLogger, systemClock, type Clock, type Logger } from "@cura/core";
import {
  createAuthService,
  DevAuthProvider,
  type AuthProvider,
  type AuthService,
} from "@cura/auth";
import { createAuditLog, type AuditLog } from "@cura/audit";
import { createScribeServices, MemoryObjectStore } from "@cura/scribe";
import { createAsrProvider } from "@cura/transcription";
import type { Role } from "@cura/shared";
import { InMemoryPubSub } from "../realtime/pubsub.js";
import { MemoryStoreFactory } from "./store-factory.js";
import { MemoryRateLimiter } from "./rate-limiter.js";
import { InMemoryAuditStore } from "./audit-store.js";
import { createDevDirectory, DEV_ORG_ID, DEV_USER_IDS } from "./directory.js";
import type { Platform, PlatformSettings } from "./index.js";

export interface MemoryPlatformOptions {
  sessionSecret?: string;
  clock?: Clock;
  logger?: Logger;
  rateLimitPerMin?: number;
  webOrigin?: string;
  nodeEnv?: string;
  secureCookies?: boolean;
  /** Role the dev fallback authenticates as (default `admin`). */
  devRole?: Role;
  /**
   * Whether the no-token dev fallback is active (default `true`). Set `false` to
   * simulate a real IdP — a missing/invalid token then yields `401`, so tests can
   * exercise the authenticated path with minted tokens.
   */
  devFallback?: boolean;
}

const DEV_SESSION_SECRET = "dev-only-session-secret-change-me";

/**
 * The zero-dependency platform: in-memory store/audit/rate-limit + the dev auth
 * provider (seeded users). This is what runs locally with no `DATABASE_URL` and
 * what every API test drives via `fastify.inject`.
 */
export function createMemoryPlatform(opts: MemoryPlatformOptions = {}): Platform {
  const clock = opts.clock ?? systemClock;
  const logger = opts.logger ?? createLogger({ name: "api", level: "silent" });
  const directory = createDevDirectory();
  const devRole: Role = opts.devRole ?? "admin";

  // With the fallback off, use a provider that verifies minted tokens but offers
  // no `devSubject` — so an unauthenticated request is rejected (like real SSO).
  const provider: AuthProvider =
    opts.devFallback === false
      ? { kind: "workos" }
      : new DevAuthProvider({ userId: DEV_USER_IDS[devRole], orgId: DEV_ORG_ID, role: devRole });

  const auth: AuthService = createAuthService({
    sessionSecret: opts.sessionSecret ?? DEV_SESSION_SECRET,
    repos: directory,
    clock,
    secureCookies: opts.secureCookies ?? false,
    provider,
  });

  const audit: AuditLog = createAuditLog({ store: new InMemoryAuditStore(), clock });

  // Scribe domain services over offline infra: mock ASR + in-memory storage.
  const scribe = createScribeServices({
    asr: createAsrProvider({ provider: "mock" }),
    objectStore: new MemoryObjectStore(),
    audit,
    clock,
  });

  const settings: PlatformSettings = {
    nodeEnv: opts.nodeEnv ?? "development",
    webOrigin: opts.webOrigin ?? "http://localhost:5173",
    rateLimitPerMin: opts.rateLimitPerMin ?? 120,
    secureCookies: opts.secureCookies ?? false,
    sessionCookieName: auth.sessions.cookieName,
  };

  return {
    kind: "memory",
    auth,
    stores: new MemoryStoreFactory(),
    audit,
    scribe,
    rateLimiter: new MemoryRateLimiter(() => clock.nowMs()),
    pubsub: new InMemoryPubSub(),
    logger,
    settings,
    async ready() {
      return { ok: true, checks: { store: true, audit: true } };
    },
    async shutdown() {
      /* nothing to release */
    },
  };
}
