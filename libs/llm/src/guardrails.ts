import { z } from "zod";
import { ProviderError, ValidationError, type Result, ok, err } from "@cura/shared";

/**
 * Output guardrails and cost accounting. This is where "note fidelity is the
 * product" is enforced: structured output is validated against zod, refusals are
 * surfaced as typed errors (never silently returned as content), limits are
 * clamped, and prompts are scrubbed of obvious raw identifiers so we send only
 * minimum-necessary PHI (CONVENTIONS §6).
 */

/** USD per 1M tokens, by model. Update as pricing changes (config, not code, ideally). */
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}
export const MODEL_PRICING: Record<string, ModelPrice> = {
  "claude-opus-4-8": { inputPerM: 15, outputPerM: 75 },
  "claude-sonnet-5": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku-4-5": { inputPerM: 0.8, outputPerM: 4 },
  "deepseek-chat": { inputPerM: 0.28, outputPerM: 0.42 },
  "deepseek-reasoner": { inputPerM: 0.28, outputPerM: 0.42 },
  mock: { inputPerM: 0, outputPerM: 0 },
};

/** Estimate USD cost for a call. Unknown models cost 0 (never throws on pricing). */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICING[model];
  if (!price) return 0;
  const cost = (inputTokens / 1_000_000) * price.inputPerM + (outputTokens / 1_000_000) * price.outputPerM;
  return Number(cost.toFixed(6));
}

/** Rough token estimate (~4 chars/token) — used by the mock's Usage accounting. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Guardrail ceilings applied to every call. */
export const LIMITS = {
  maxOutputTokens: 8192,
  maxTimeoutMs: 120_000,
  defaultOutputTokens: 2048,
  defaultTimeoutMs: 60_000,
} as const;

export function clampMaxTokens(requested?: number): number {
  const n = requested ?? LIMITS.defaultOutputTokens;
  return Math.max(1, Math.min(LIMITS.maxOutputTokens, Math.floor(n)));
}
export function clampTimeout(requested?: number): number {
  const n = requested ?? LIMITS.defaultTimeoutMs;
  return Math.max(1000, Math.min(LIMITS.maxTimeoutMs, Math.floor(n)));
}

/**
 * Validate a raw structured value against its schema. Returns a Result so the
 * caller can decide to repair-retry (expected failure) vs. throw.
 */
export function validateStructured<T>(schema: z.ZodType<T>, raw: unknown): Result<T, ValidationError> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(
    new ValidationError("structured output failed schema validation", {
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    }),
  );
}

const REFUSAL_PATTERNS = [
  /\bI can'?t help with that\b/i,
  /\bI'?m not able to (help|assist) with\b/i,
  /\bI cannot (assist|comply|provide)\b/i,
  /\bI must decline\b/i,
];

/**
 * Detect a model refusal. Prefer the structured `stop_reason: "refusal"` signal;
 * fall back to text heuristics for providers/paths that don't set it.
 */
export function isRefusal(text: string, stopReason?: string): boolean {
  if (stopReason === "refusal") return true;
  return REFUSAL_PATTERNS.some((re) => re.test(text));
}

/**
 * A `ProviderError` marked as NON-retryable (deterministic failure). The gateway
 * retries transient provider/network errors but must not re-run a call that will
 * deterministically fail the same way (schema mismatch after repair, refusal,
 * tool-loop exhaustion).
 */
export function nonRetryableProviderError(message: string, cause?: unknown): ProviderError {
  return new ProviderError(message, { details: { retryable: false }, cause });
}

/** True if this error was explicitly marked non-retryable by the LLM layer. */
export function isNonRetryable(err: unknown): boolean {
  return (
    err instanceof ProviderError &&
    typeof err.details === "object" &&
    err.details !== null &&
    (err.details as { retryable?: boolean }).retryable === false
  );
}

/** Raise a typed error for a refusal (never leak the refusal text as content). */
export function assertNotRefusal(text: string, stopReason?: string): void {
  if (isRefusal(text, stopReason)) {
    throw nonRetryableProviderError("The model declined to produce output for this request");
  }
}

// Obvious raw identifiers that should never be sent verbatim to a subprocessor.
const PHI_PATTERNS: { re: RegExp; token: string }[] = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, token: "[SSN]" },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, token: "[EMAIL]" },
  { re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, token: "[PHONE]" },
  { re: /\bMRN[:#]?\s?\w+\b/gi, token: "[MRN]" },
];

/**
 * Scrub obvious raw identifiers from prompt text (defense-in-depth). The primary
 * PHI-minimization happens upstream (de-identified labels); this catches leaks.
 */
export function minimizePhi(text: string): string {
  let out = text;
  for (const { re, token } of PHI_PATTERNS) out = out.replace(re, token);
  return out;
}
