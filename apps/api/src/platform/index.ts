import type { Logger } from "@cura/core";
import type { AuthService } from "@cura/auth";
import type { AuditLog } from "@cura/audit";
import type { ScribeServices } from "@cura/scribe";
import type { PubSub } from "../realtime/pubsub.js";
import type { StoreFactory } from "./store-factory.js";
import type { RateLimiter } from "./rate-limiter.js";

/**
 * Everything the gateway needs, resolved once at boot and shared across
 * requests. Handlers never reach for globals — they read the platform off the
 * Fastify instance. Two builds satisfy this contract: an in-memory one for
 * dev/tests and a Postgres/Redis one for prod (selected by config).
 */
export interface Platform {
  readonly kind: "memory" | "postgres";
  readonly auth: AuthService;
  readonly stores: StoreFactory;
  readonly audit: AuditLog;
  /** Scribe domain services (session lifecycle, consent, capture, transcripts). */
  readonly scribe: ScribeServices;
  readonly rateLimiter: RateLimiter;
  /** Realtime fan-out substrate (Redis in prod, in-memory in dev/tests). */
  readonly pubsub: PubSub;
  readonly logger: Logger;
  readonly settings: PlatformSettings;
  /** Readiness probe: are backing stores reachable? */
  ready(): Promise<ReadinessReport>;
  /** Release connections (Redis, PG pool) on shutdown. */
  shutdown(): Promise<void>;
}

export interface PlatformSettings {
  nodeEnv: string;
  webOrigin: string;
  rateLimitPerMin: number;
  secureCookies: boolean;
  sessionCookieName: string;
}

export interface ReadinessReport {
  ok: boolean;
  checks: Record<string, boolean>;
}

export * from "./store-factory.js";
export * from "./rate-limiter.js";
export * from "./audit-store.js";
export * from "./directory.js";
export { createMemoryPlatform } from "./memory.js";
export { createPostgresPlatform } from "./postgres.js";
