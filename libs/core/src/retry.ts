import { ProviderError } from "@cura/shared";

/** Tuning for {@link withRetry}. All fields optional; sensible defaults applied. */
export interface RetryPolicy {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Base delay in ms for the first backoff. Default 100. */
  baseMs?: number;
  /** Upper bound on any single backoff delay. Default 2000. */
  maxDelayMs?: number;
  /** Multiplier applied each attempt (exponential). Default 2. */
  factor?: number;
  /** Jitter ratio 0..1 applied to each delay to avoid thundering herds. Default 0.2. */
  jitter?: number;
  /** Predicate: should this error be retried? Default: retry everything. */
  retryable?: (err: unknown) => boolean;
  /** Sleep function (injectable for tests). Default: real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Random source 0..1 (injectable for deterministic tests). Default Math.random. */
  random?: () => number;
  /** Called before each retry (observability hook). */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/** Thrown when all attempts are exhausted. Carries the last underlying error. */
export class RetryError extends ProviderError {
  readonly attempts: number;
  constructor(attempts: number, cause: unknown) {
    super(`Operation failed after ${attempts} attempt(s)`, { cause });
    this.attempts = attempts;
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff + jitter.
 * Returns the resolved value, or throws {@link RetryError} once attempts are
 * exhausted (or immediately if `retryable` rejects the error). Used by ASR/LLM
 * providers (Phase 08/09) and EHR sync (Phase 13).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = {},
): Promise<T> {
  const attempts = Math.max(1, policy.attempts ?? 3);
  const baseMs = policy.baseMs ?? 100;
  const maxDelayMs = policy.maxDelayMs ?? 2000;
  const factor = policy.factor ?? 2;
  const jitter = Math.min(1, Math.max(0, policy.jitter ?? 0.2));
  const retryable = policy.retryable ?? (() => true);
  const sleep = policy.sleep ?? defaultSleep;
  const random = policy.random ?? Math.random;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !retryable(error)) break;
      const exp = Math.min(maxDelayMs, baseMs * Math.pow(factor, attempt - 1));
      // Symmetric jitter around the exponential target, clamped to [0, maxDelayMs].
      const delta = exp * jitter * (random() * 2 - 1);
      const delayMs = Math.max(0, Math.min(maxDelayMs, Math.round(exp + delta)));
      policy.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw new RetryError(attempts, lastError);
}
