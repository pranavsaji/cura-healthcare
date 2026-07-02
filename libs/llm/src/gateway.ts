import { withRetry, RetryError } from "@cura/core";
import { ProviderError, isAppError } from "@cura/shared";
import type { z } from "zod";
import { isNonRetryable } from "./guardrails.js";
import type {
  GenOptions,
  GenStructuredResult,
  GenTextResult,
  LlmProvider,
  RunToolsResult,
  ToolSpec,
  Usage,
} from "./types.js";

/**
 * The gateway wraps a concrete provider with cross-cutting reliability: retry
 * with backoff on transient failures, an optional model fallback, and running
 * token/cost accounting. Note-gen and agents talk to the gateway, not the raw
 * provider, so retries/fallback/usage are uniform (CONVENTIONS §2). It is itself
 * an {@link LlmProvider}, so it composes transparently.
 */
export interface GatewayOptions {
  /** Total attempts per call including the first. Default 3. */
  retryAttempts?: number;
  /** Model to retry with if the primary model keeps failing. */
  fallbackModel?: string;
  /** Called after every successful call with its Usage (cost/audit sink, no PHI). */
  onUsage?: (usage: Usage) => void;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
}

export class LlmGateway implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private totalInput = 0;
  private totalOutput = 0;
  private totalCost = 0;
  private calls = 0;

  constructor(
    private readonly provider: LlmProvider,
    private readonly options: GatewayOptions = {},
  ) {
    this.name = `gateway:${provider.name}`;
    this.model = provider.model;
  }

  generateText(prompt: string, options: GenOptions = {}): Promise<GenTextResult> {
    return this.run((model) => this.provider.generateText(prompt, withModel(options, model)), (r) => r.usage);
  }

  generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options: GenOptions = {},
  ): Promise<GenStructuredResult<T>> {
    return this.run(
      (model) => this.provider.generateStructured(schema, prompt, withModel(options, model)),
      (r) => r.usage,
    );
  }

  runTools(
    prompt: string,
    tools: ToolSpec[],
    options: GenOptions & { maxSteps?: number } = {},
  ): Promise<RunToolsResult> {
    return this.run((model) => this.provider.runTools(prompt, tools, withModel(options, model)), (r) => r.usage);
  }

  /** Aggregate accounting since construction (for audit/observability). */
  totals(): { calls: number; inputTokens: number; outputTokens: number; costUsd: number } {
    return {
      calls: this.calls,
      inputTokens: this.totalInput,
      outputTokens: this.totalOutput,
      costUsd: Number(this.totalCost.toFixed(6)),
    };
  }

  /**
   * Execute with retry + optional model fallback, then record usage. Repair
   * failures (schema mismatch) are NOT retried here — they're deterministic and
   * already retried once inside the provider; only transient errors are retried.
   */
  private async run<R>(call: (model?: string) => Promise<R>, usageOf: (r: R) => Usage): Promise<R> {
    const attempts = this.options.retryAttempts ?? 3;
    try {
      const result = await withRetry(() => call(), {
        attempts,
        retryable: isTransient,
        ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
      });
      this.record(usageOf(result));
      return result;
    } catch (primaryError) {
      // withRetry wraps the last failure in a RetryError — unwrap so callers see
      // the real error type (ValidationError, non-retryable ProviderError, …).
      const cause = unwrapRetry(primaryError);
      if (!this.options.fallbackModel) throw asProviderError(cause);
      // Fallback: one shot on the fallback model (no further retry storm).
      try {
        const result = await call(this.options.fallbackModel);
        this.record(usageOf(result));
        return result;
      } catch (fallbackError) {
        throw asProviderError(unwrapRetry(fallbackError));
      }
    }
  }

  private record(usage: Usage): void {
    this.calls += 1;
    this.totalInput += usage.inputTokens;
    this.totalOutput += usage.outputTokens;
    this.totalCost += usage.costUsd;
    this.options.onUsage?.(usage);
  }
}

function withModel(options: GenOptions, model?: string): GenOptions {
  return model ? { ...options, model } : options;
}

/** Retry transient failures only; a validation/refusal/repair failure is terminal. */
function isTransient(err: unknown): boolean {
  if (isNonRetryable(err)) return false; // schema mismatch, refusal, tool-loop exhaustion
  if (isAppError(err)) {
    // Provider (network/5xx) errors are transient; validation/auth are not.
    return err.code === "provider_error" || err.code === "rate_limited";
  }
  return err instanceof Error; // unknown fetch/network error → retry
}

/** Unwrap a `RetryError` to the underlying failure it carries. */
function unwrapRetry(err: unknown): unknown {
  return err instanceof RetryError ? (err.cause ?? err) : err;
}

function asProviderError(err: unknown): Error {
  if (isAppError(err)) return err;
  return new ProviderError("LLM call failed", { cause: err });
}
