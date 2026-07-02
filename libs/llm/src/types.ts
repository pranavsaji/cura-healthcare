import type { z } from "zod";

/**
 * The one LLM interface used by note-gen (Phase 11) AND future agents
 * (Curadesk/Curabill). Apps/services depend on this — never on the Anthropic SDK
 * directly (CONVENTIONS §2). Providers: `mock` (deterministic, offline) and
 * `anthropic` (Claude Messages API). Every call returns {@link Usage} for
 * reproducibility + cost/audit (Phase 14).
 */

/** Token/cost/latency accounting attached to every generation. Never holds PHI. */
export interface Usage {
  model: string;
  /** Prompt registry version, when the call went through a registered prompt. */
  promptVersion?: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD cost from the model price table (0 for the mock). */
  costUsd: number;
  latencyMs: number;
}

/** Shared knobs for a generation. All optional; providers apply sane defaults. */
export interface GenOptions {
  /** Hard cap on output tokens (guardrail). */
  maxTokens?: number;
  temperature?: number;
  /** System prompt (role/format instructions). */
  system?: string;
  /** Abort the call after this many ms (guardrail). */
  timeoutMs?: number;
  /** Model override for this call (else the provider default). */
  model?: string;
  /** Tag the resulting Usage with a prompt registry version. */
  promptVersion?: string;
  /** Streaming sink for progressive text (note fill). */
  onToken?: (delta: string) => void;
}

export interface GenTextResult {
  text: string;
  usage: Usage;
  stopReason?: string;
}

export interface GenStructuredResult<T> {
  value: T;
  usage: Usage;
}

/** A tool the model may call in an agent loop. `schema` validates its input. */
export interface ToolSpec<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  /** Execute the tool call; return a string result fed back to the model. */
  handler: (input: T) => Promise<string> | string;
}

export interface RunToolsResult {
  text: string;
  usage: Usage;
  /** Number of tool round-trips taken before the final answer. */
  steps: number;
}

/**
 * A text + structured + tool-calling LLM. `generateStructured` is the product-
 * critical path: it returns a value that `schema.parse()` accepts, or throws a
 * typed `ProviderError` after exactly one repair-retry (see gateway/guardrails).
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  generateText(prompt: string, options?: GenOptions): Promise<GenTextResult>;
  generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options?: GenOptions,
  ): Promise<GenStructuredResult<T>>;
  runTools(prompt: string, tools: ToolSpec[], options?: GenOptions & { maxSteps?: number }): Promise<RunToolsResult>;
}

/** Selection + credentials for {@link createLlm}. */
export interface LlmConfig {
  provider: "mock" | "anthropic";
  apiKey?: string | undefined;
  model?: string | undefined;
  /** Retry attempts for transient provider failures (gateway). Default 3. */
  retryAttempts?: number;
  /** Model to fall back to when the primary errors (gateway). */
  fallbackModel?: string | undefined;
}
