import { createLogger, type Config, type Logger } from "@cura/core";
import {
  createDb,
  createRepositories,
  seed,
  SEED_IDS,
  type Database,
  type Repositories,
} from "@cura/db";
import {
  createAuthService,
  DevAuthProvider,
  HttpWorkOSPort,
  WorkOSAuthProvider,
  type AuthProvider,
  type AuthService,
  type UserDirectory,
} from "@cura/auth";
import { createAuditLog, type AuditLog } from "@cura/audit";
import { createScribeServices, createObjectStore, type ObjectStore } from "@cura/scribe";
import { createAsrProvider } from "@cura/transcription";
import type { Redis } from "ioredis";
import { InMemoryPubSub, RedisPubSub, type PubSub } from "../realtime/pubsub.js";
import { PostgresStoreFactory } from "./store-factory.js";
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from "./rate-limiter.js";
import type { Platform, PlatformSettings } from "./index.js";

/**
 * The production platform: Postgres-backed stores + audit, Redis rate limiting
 * (falling back to in-memory when `REDIS_URL` is unset), and the configured auth
 * provider (dev fallback or real WorkOS). Seeds a dev org on first boot so a
 * fresh database is immediately usable.
 */
export async function createPostgresPlatform(config: Config): Promise<Platform> {
  if (!config.DATABASE_URL) throw new Error("createPostgresPlatform requires DATABASE_URL");
  const logger: Logger = createLogger({ name: "api", level: config.LOG_LEVEL });

  const db: Database = createDb(config.DATABASE_URL);
  const repos: Repositories = createRepositories(db, { encryptionKey: config.ENCRYPTION_KEY });

  // Seed a dev org on first boot so the app is immediately usable.
  const existing = await repos.orgs.byId(SEED_IDS.org);
  if (!existing) await seed(db, config.ENCRYPTION_KEY);

  const provider = buildProvider(config, repos);
  const auth: AuthService = createAuthService({
    sessionSecret: config.SESSION_SECRET ?? config.ENCRYPTION_KEY,
    repos,
    provider,
    secureCookies: config.NODE_ENV === "production",
    sameSite: config.CROSS_SITE_COOKIES ? "none" : "lax",
  });

  const audit: AuditLog = createAuditLog({ store: repos.audit });

  // Scribe domain services. ASR is selected by config (mock unless a real key is
  // present + a BAA is in place). Object storage defaults to local disk until S3
  // env (bucket/region/KMS) is wired; the S3ObjectStore impl is ready to slot in.
  const objectStore: ObjectStore =
    config.STORAGE_PROVIDER === "s3"
      ? createObjectStore({ provider: "local", root: ".tmp/recordings" }) // TODO: S3 env → createObjectStore({ provider: "s3", ... })
      : createObjectStore({ provider: "local", root: ".tmp/recordings" });
  const scribe = createScribeServices({
    asr: createAsrProvider(
      {
        provider: config.ASR_PROVIDER,
        // Provider-named keys (.env.example) win; ASR_API_KEY is the generic fallback.
        apiKey:
          (config.ASR_PROVIDER === "deepgram"
            ? config.DEEPGRAM_API_KEY
            : config.ASSEMBLYAI_API_KEY) ?? config.ASR_API_KEY,
        vocabulary: [],
      },
      { onFallback: (reason) => logger.warn({ reason }, "asr provider fell back to mock") },
    ),
    objectStore,
    audit,
    retentionDays: config.RETENTION_DAYS,
  });

  let redis: Redis | undefined;
  let rateLimiter: RateLimiter;
  let pubsub: PubSub;
  if (config.REDIS_URL) {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
    rateLimiter = new RedisRateLimiter(redis);
    // Pub/sub needs its own connections (a subscriber can't issue commands);
    // RedisPubSub.close() quits both on shutdown.
    pubsub = new RedisPubSub(
      new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null }),
      new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null }),
    );
  } else {
    rateLimiter = new MemoryRateLimiter();
    pubsub = new InMemoryPubSub();
  }

  const settings: PlatformSettings = {
    nodeEnv: config.NODE_ENV,
    webOrigin: config.WEB_ORIGIN,
    rateLimitPerMin: config.RATE_LIMIT_PER_MIN,
    secureCookies: config.NODE_ENV === "production",
    sessionCookieName: auth.sessions.cookieName,
    // The SSO callback lands on the API (this service), so WorkOS must redirect
    // here — not at the web origin. Sourced from WORKOS_REDIRECT_URI.
    authCallbackUrl: config.WORKOS_REDIRECT_URI,
  };

  return {
    kind: "postgres",
    auth,
    stores: new PostgresStoreFactory(repos),
    audit,
    scribe,
    rateLimiter,
    pubsub,
    logger,
    settings,
    async ready() {
      const checks: Record<string, boolean> = {};
      // A tenant-scoped read doubles as a DB liveness probe.
      checks.db = await ping(() => repos.orgs.byId(SEED_IDS.org));
      checks.redis = redis ? await ping(() => redis!.ping()) : true;
      return { ok: Object.values(checks).every(Boolean), checks };
    },
    async shutdown() {
      await pubsub.close().catch(() => undefined);
      if (redis) await redis.quit().catch(() => undefined);
    },
  };
}

/** Select the auth provider: real WorkOS when configured, else the dev fallback. */
function buildProvider(config: Config, repos: Repositories): AuthProvider {
  if (config.AUTH_PROVIDER !== "workos" || !config.WORKOS_API_KEY || !config.WORKOS_CLIENT_ID) {
    // Default: authenticate the seeded clinician when no real IdP is configured.
    return new DevAuthProvider({ userId: SEED_IDS.clinician, orgId: SEED_IDS.org, role: "clinician" });
  }
  const directory: UserDirectory = {
    async findByExternalId(orgId, externalId) {
      const u = await repos.users.byWorkosUserId(orgId, externalId);
      return u ? { id: u.id } : null;
    },
    async create(orgId, input) {
      const u = await repos.users.create(orgId, {
        email: input.email,
        name: input.name,
        role: input.role,
        workosUserId: input.workosUserId,
      });
      return { id: u.id };
    },
    async updateRole(orgId, userId, role) {
      await repos.users.updateRole(orgId, userId, role);
    },
  };
  return new WorkOSAuthProvider({
    port: new HttpWorkOSPort(config.WORKOS_API_KEY, config.WORKOS_CLIENT_ID),
    directory,
    clientId: config.WORKOS_CLIENT_ID,
    // AuthKit email/password users carry no WorkOS org — place them in the
    // seeded org so a fresh deployment has a usable tenant out of the box.
    defaultOrgId: SEED_IDS.org,
    async resolveOrgId(workosOrgId) {
      const org = await repos.orgs.byWorkosOrgId(workosOrgId);
      return org?.id ?? null;
    },
  });
}

async function ping(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}
