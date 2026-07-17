import { loadConfig, type Config } from "@cura/core";

/**
 * Resolve the process {@link Config} from the environment. In non-production we
 * inject dev-safe fallbacks for the crypto/session secrets so `pnpm dev:api`
 * works with no `.env`; production has no fallbacks (config validation fails
 * fast if a required secret is missing).
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Best-effort load of the repo-root .env (tsx/node doesn't auto-load it).
  try {
    const root = new URL("../../../.env", import.meta.url);
    (process as NodeJS.Process & { loadEnvFile?: (p: string | URL) => void }).loadEnvFile?.(root);
  } catch {
    /* no .env present — dev fallbacks below cover local runs */
  }

  const raw: Record<string, string | undefined> = { ...process.env, ...env };
  // Treat empty-string env vars as unset — a common `.env` footgun that would
  // otherwise fail URL/enum validation (e.g. `DATABASE_URL=` → "" is not a URL).
  for (const key of Object.keys(raw)) {
    if (raw[key] === "") raw[key] = undefined;
  }
  // PaaS hosts (Railway, Render, Fly, Heroku) inject the listening port as
  // `PORT`; honor it when `API_PORT` isn't set explicitly so the container
  // binds the address the platform routes to.
  raw.API_PORT ??= raw.PORT;
  if (raw.NODE_ENV !== "production") {
    raw.ENCRYPTION_KEY ??= "dev-only-encryption-key-change-me-32b";
    raw.SESSION_SECRET ??= "dev-only-session-secret-change-me-32b";
  }
  return loadConfig(raw);
}
