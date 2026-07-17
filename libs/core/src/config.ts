import { z } from "zod";

/**
 * The single source of truth for runtime configuration. Every process reads its
 * settings from here — no `process.env` access scattered across features
 * (CONVENTIONS §2). Validated once at boot; invalid/missing config fails fast
 * with a readable, aggregated error that never echoes secret values.
 */

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),

    // Networking
    API_PORT: z.coerce.number().int().positive().default(4100),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    // Set `true` when the web app and API are on different sites (e.g. Vercel web
    // ↔ Railway API) so the session cookie is issued `SameSite=None; Secure` and
    // survives cross-site requests. Left `false` for same-origin/local dev.
    CROSS_SITE_COOKIES: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Data stores (optional → in-memory/dev; required for prod wiring)
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),

    // PHI encryption key (envelope encryption of PII columns, Phase 03).
    // Required with no default: there is no safe fallback for a crypto key.
    ENCRYPTION_KEY: z
      .string()
      .min(16, "ENCRYPTION_KEY must be at least 16 chars (32+ bytes recommended)"),

    // Providers — swappable, mock by default (CONVENTIONS §2).
    ASR_PROVIDER: z.enum(["mock", "deepgram", "assemblyai"]).default("mock"),
    ASR_API_KEY: z.string().optional(),
    DEEPGRAM_API_KEY: z.string().optional(),
    ASSEMBLYAI_API_KEY: z.string().optional(),
    LLM_PROVIDER: z.enum(["mock", "anthropic", "deepseek"]).default("mock"),
    LLM_MODEL: z.string().default("claude-opus-4-8"),
    ANTHROPIC_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    STORAGE_PROVIDER: z.enum(["mock", "s3"]).default("mock"),
    AUTH_PROVIDER: z.enum(["mock", "workos"]).default("mock"),
    WORKOS_API_KEY: z.string().optional(),
    WORKOS_CLIENT_ID: z.string().optional(),
    WORKOS_REDIRECT_URI: z.string().url().optional(),
    // Session token signing secret (Phase 05). Optional in dev (falls back to
    // ENCRYPTION_KEY); required in production so tokens can't be forged.
    SESSION_SECRET: z
      .string()
      .min(16, "SESSION_SECRET must be at least 16 chars")
      .optional(),

    // Limits
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
    RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
    RETENTION_DAYS: z.coerce.number().int().positive().default(3650),

    // Feature flags (comma-separated list of enabled flag names)
    FEATURE_FLAGS: z.string().default(""),
  })
  // Cross-field rules: a real provider needs its credential. Provider keys are
  // enforced only in production: dev/CI boot keyless and the ASR/LLM factories
  // degrade to the mock (logging the downgrade), so a real-provider default in
  // .env never bricks a keyless machine. Production keeps fail-fast.
  .superRefine((c, ctx) => {
    const requireKey = (cond: boolean, path: string, msg: string) => {
      if (cond) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: msg });
    };
    const prod = c.NODE_ENV === "production";
    const asrKey =
      c.ASR_PROVIDER === "deepgram"
        ? c.DEEPGRAM_API_KEY ?? c.ASR_API_KEY
        : c.ASSEMBLYAI_API_KEY ?? c.ASR_API_KEY;
    requireKey(
      prod && c.ASR_PROVIDER !== "mock" && !asrKey,
      "ASR_API_KEY",
      `an ASR API key is required when ASR_PROVIDER="${c.ASR_PROVIDER}"`,
    );
    const llmKey = c.LLM_PROVIDER === "deepseek" ? c.DEEPSEEK_API_KEY : c.ANTHROPIC_API_KEY;
    requireKey(
      prod && c.LLM_PROVIDER !== "mock" && !llmKey,
      c.LLM_PROVIDER === "deepseek" ? "DEEPSEEK_API_KEY" : "ANTHROPIC_API_KEY",
      `an LLM API key is required when LLM_PROVIDER="${c.LLM_PROVIDER}"`,
    );
    requireKey(
      c.AUTH_PROVIDER === "workos" && !c.WORKOS_API_KEY,
      "WORKOS_API_KEY",
      'WORKOS_API_KEY is required when AUTH_PROVIDER="workos"',
    );
    requireKey(
      c.AUTH_PROVIDER === "workos" && !c.WORKOS_CLIENT_ID,
      "WORKOS_CLIENT_ID",
      'WORKOS_CLIENT_ID is required when AUTH_PROVIDER="workos"',
    );
    requireKey(
      c.NODE_ENV === "production" && !c.DATABASE_URL,
      "DATABASE_URL",
      "DATABASE_URL is required in production",
    );
    requireKey(
      c.NODE_ENV === "production" && !c.SESSION_SECRET,
      "SESSION_SECRET",
      "SESSION_SECRET is required in production",
    );
  });

export type Config = z.infer<typeof ConfigSchema>;

/** Keys whose values must never be printed, even in a validation error. */
const SECRET_KEYS = new Set([
  "ENCRYPTION_KEY",
  "ASR_API_KEY",
  "DEEPGRAM_API_KEY",
  "ASSEMBLYAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "WORKOS_API_KEY",
  "SESSION_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
]);

/** Raised when config validation fails. `message` lists every problem, no values. */
export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

/**
 * Parse + validate configuration from an env-like record (defaults to
 * `process.env`). Throws {@link ConfigError} listing every invalid/missing var.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => {
    const key = String(i.path[0] ?? "(root)");
    return `${key}: ${i.message}`;
  });
  throw new ConfigError(issues);
}

/**
 * Redact secret values from a config object for safe logging/debug printing.
 * Non-secret settings are preserved so the effective config is inspectable.
 */
export function redactConfig(config: Config): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = SECRET_KEYS.has(key) && value ? "[redacted]" : value;
  }
  return out;
}
