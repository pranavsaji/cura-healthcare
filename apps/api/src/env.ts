// Best-effort load of the repo-root .env in dev (tsx/node doesn't auto-load it).
try {
  const root = new URL("../../../.env", import.meta.url);
  (process as NodeJS.Process & { loadEnvFile?: (p: string | URL) => void }).loadEnvFile?.(root);
} catch {
  /* no .env present — code defaults below are dev-safe (mock providers) */
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4100),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "",
  asrProvider: (process.env.ASR_PROVIDER ?? "mock") as "mock" | "deepgram" | "assemblyai",
  // Provider-named keys (.env.example) win; ASR_API_KEY is the generic fallback.
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? process.env.ASR_API_KEY ?? "",
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY ?? process.env.ASR_API_KEY ?? "",
  llmProvider: (process.env.LLM_PROVIDER ?? "mock") as "mock" | "anthropic" | "deepseek",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-opus-4-8",
  // Telemetry exporter: "none" (default, zero overhead) | "memory" | "otlp".
  otelExporter: (process.env.OTEL_EXPORTER ?? "none") as "none" | "memory" | "otlp",
  // Envelope-encryption passphrase for PII columns (Postgres path). Dev default
  // is safe because the mock/in-memory path never touches it; prod must set it.
  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-encryption-key-change-me",
};

/** True when we can rely on a real Postgres. Otherwise we use the in-memory store. */
export const usePostgres = env.databaseUrl.length > 0;
