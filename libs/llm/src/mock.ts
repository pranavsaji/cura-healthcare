import type { z } from "zod";
import { mockValueForSchema } from "./schema.js";
import { estimateTokens } from "./guardrails.js";
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
 * Deterministic, offline LLM. Structured output is synthesized from the schema
 * (`mockValueForSchema`) so it ALWAYS passes `schema.parse()` — the contract the
 * whole system relies on — with zero network, zero cost, and no randomness
 * (CONVENTIONS §5). Tests can inject `responders` to script exact outputs.
 */
export interface MockLlmOptions {
  model?: string;
  responders?: {
    text?: (prompt: string, options?: GenOptions) => string;
    structured?: (schema: z.ZodTypeAny, prompt: string, options?: GenOptions) => unknown;
  };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly model: string;
  private readonly responders: MockLlmOptions["responders"];

  constructor(options: MockLlmOptions = {}) {
    this.model = options.model ?? "mock";
    this.responders = options.responders;
  }

  async generateText(prompt: string, options: GenOptions = {}): Promise<GenTextResult> {
    const text = this.responders?.text?.(prompt, options) ?? `mock response for: ${firstLine(prompt)}`;
    if (options.onToken) for (const chunk of text.split(" ")) options.onToken(chunk + " ");
    return { text, usage: this.usage(prompt, text, options), stopReason: "end_turn" };
  }

  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options: GenOptions = {},
  ): Promise<GenStructuredResult<T>> {
    const raw =
      this.responders?.structured?.(schema as z.ZodTypeAny, prompt, options) ??
      mockValueForSchema(schema as z.ZodTypeAny);
    // Parse so the mock enforces the same guarantee the real provider must meet:
    // the returned value is schema-valid (throws here only on a bad responder).
    const value = schema.parse(raw);
    return { value, usage: this.usage(prompt, JSON.stringify(value), options) };
  }

  async runTools(
    prompt: string,
    tools: ToolSpec[],
    options: GenOptions & { maxSteps?: number } = {},
  ): Promise<RunToolsResult> {
    // Deterministic single round-trip: invoke the first tool with a
    // schema-derived input, then return an answer incorporating its result.
    if (tools.length === 0) {
      const res = await this.generateText(prompt, options);
      return { text: res.text, usage: res.usage, steps: 0 };
    }
    const tool = tools[0]!;
    const input = mockValueForSchema(tool.schema as z.ZodTypeAny);
    const toolResult = await tool.handler(tool.schema.parse(input));
    const text = `mock used tool "${tool.name}" → ${toolResult}`;
    return { text, usage: this.usage(prompt, text, options), steps: 1 };
  }

  private usage(prompt: string, output: string, options: GenOptions): Usage {
    return {
      model: this.model,
      ...(options.promptVersion ? { promptVersion: options.promptVersion } : {}),
      inputTokens: estimateTokens(prompt + (options.system ?? "")),
      outputTokens: estimateTokens(output),
      costUsd: 0,
      latencyMs: 0,
    };
  }
}

function firstLine(text: string): string {
  return text.split("\n")[0]!.slice(0, 80);
}
