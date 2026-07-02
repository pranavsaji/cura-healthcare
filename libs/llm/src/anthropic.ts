import type { z } from "zod";
import { ProviderError } from "@cura/shared";
import {
  assertNotRefusal,
  clampMaxTokens,
  clampTimeout,
  estimateCost,
  minimizePhi,
  nonRetryableProviderError,
  validateStructured,
} from "./guardrails.js";
import { zodToJsonSchema } from "./schema.js";
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
 * Claude provider over the raw Messages API (`fetch`, no SDK — so no vendor
 * import leaks past this package, CONVENTIONS §2). Structured output uses a
 * FORCED tool call (`tool_choice: {type:"tool"}`) so the response is guaranteed
 * to be a parsed object matching a JSON Schema derived from the caller's zod
 * schema; we then re-validate with zod and do exactly one repair round-trip on a
 * mismatch before failing typed. Verified against the Anthropic API reference
 * (endpoint, headers, tool-use, usage fields, streaming SSE, stop_reason).
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}
type Message = { role: "user" | "assistant"; content: unknown };

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-opus-4-8";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateText(prompt: string, options: GenOptions = {}): Promise<GenTextResult> {
    const model = options.model ?? this.model;
    const messages: Message[] = [{ role: "user", content: minimizePhi(prompt) }];
    if (options.onToken) return this.streamText(model, messages, options);

    const start = nowMs();
    const res = await this.call({ model, messages, options });
    const text = joinText(res).trim();
    assertNotRefusal(text, res.stop_reason);
    return { text, usage: this.usage(model, res, start, options), stopReason: res.stop_reason };
  }

  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options: GenOptions = {},
  ): Promise<GenStructuredResult<T>> {
    const model = options.model ?? this.model;
    const toolName = "emit_result";
    const tool = { name: toolName, description: "Return the result as structured data.", input_schema: zodToJsonSchema(schema) };
    const messages: Message[] = [{ role: "user", content: minimizePhi(prompt) }];

    const start = nowMs();
    let res = await this.call({ model, messages, options, tools: [tool], toolChoice: { type: "tool", name: toolName } });
    let usageInput = res.usage?.input_tokens ?? 0;
    let usageOutput = res.usage?.output_tokens ?? 0;
    let block = findToolUse(res, toolName);

    let validated = block ? validateStructured(schema, block.input) : null;
    if (!validated || !validated.ok) {
      // One repair round-trip: show the model its invalid output + the errors.
      const errorDetail = validated && !validated.ok ? JSON.stringify(validated.error.details) : "no tool call returned";
      const repairMessages: Message[] = [
        ...messages,
        { role: "assistant", content: block ? [block] : "…" },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: block?.id ?? "missing",
              content: `Your output failed validation: ${errorDetail}. Call ${toolName} again with corrected data that matches the schema exactly.`,
              is_error: true,
            },
          ],
        },
      ];
      res = await this.call({ model, messages: repairMessages, options, tools: [tool], toolChoice: { type: "tool", name: toolName } });
      usageInput += res.usage?.input_tokens ?? 0;
      usageOutput += res.usage?.output_tokens ?? 0;
      block = findToolUse(res, toolName);
      validated = block ? validateStructured(schema, block.input) : null;
      if (!validated || !validated.ok) {
        throw nonRetryableProviderError(
          "structured output did not match schema after repair",
          validated && !validated.ok ? validated.error : undefined,
        );
      }
    }

    return {
      value: validated.value,
      usage: this.usageFrom(model, usageInput, usageOutput, start, options),
    };
  }

  async runTools(
    prompt: string,
    tools: ToolSpec[],
    options: GenOptions & { maxSteps?: number } = {},
  ): Promise<RunToolsResult> {
    const model = options.model ?? this.model;
    const maxSteps = Math.max(1, options.maxSteps ?? 6);
    const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: zodToJsonSchema(t.schema) }));
    const byName = new Map(tools.map((t) => [t.name, t] as const));
    const messages: Message[] = [{ role: "user", content: minimizePhi(prompt) }];

    const start = nowMs();
    let totalIn = 0;
    let totalOut = 0;
    let steps = 0;

    for (let i = 0; i < maxSteps; i++) {
      const res = await this.call({ model, messages, options, tools: toolDefs, toolChoice: { type: "auto" } });
      totalIn += res.usage?.input_tokens ?? 0;
      totalOut += res.usage?.output_tokens ?? 0;
      const toolUses = (res.content ?? []).filter((b) => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = joinText(res).trim();
        assertNotRefusal(text, res.stop_reason);
        return { text, usage: this.usageFrom(model, totalIn, totalOut, start, options), steps };
      }
      // Execute each requested tool and feed results back.
      messages.push({ role: "assistant", content: res.content });
      const results: unknown[] = [];
      for (const use of toolUses) {
        steps += 1;
        const tool = byName.get(use.name ?? "");
        let content: string;
        if (!tool) content = `error: unknown tool ${use.name}`;
        else {
          const parsed = tool.schema.safeParse(use.input);
          content = parsed.success
            ? await tool.handler(parsed.data)
            : `error: invalid arguments (${parsed.error.issues.map((x) => x.message).join(", ")})`;
        }
        results.push({ type: "tool_result", tool_use_id: use.id, content });
      }
      messages.push({ role: "user", content: results });
    }
    throw nonRetryableProviderError(`tool loop exceeded ${maxSteps} steps without a final answer`);
  }

  // ── HTTP ───────────────────────────────────────────────────────────

  private async call(args: {
    model: string;
    messages: Message[];
    options: GenOptions;
    tools?: unknown[];
    toolChoice?: unknown;
  }): Promise<AnthropicResponse> {
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: clampMaxTokens(args.options.maxTokens),
      messages: args.messages,
    };
    if (args.options.system) body.system = args.options.system;
    if (args.options.temperature !== undefined) body.temperature = args.options.temperature;
    if (args.tools) body.tools = args.tools;
    if (args.toolChoice) body.tool_choice = args.toolChoice;

    const res = await this.post(body, args.options);
    return (await res.json()) as AnthropicResponse;
  }

  private async post(body: unknown, options: GenOptions): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), clampTimeout(options.timeoutMs));
    try {
      const res = await this.fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await safeText(res);
        throw new ProviderError(`Anthropic request failed (${res.status})`, { details: { status: res.status, detail } });
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  private async streamText(model: string, messages: Message[], options: GenOptions): Promise<GenTextResult> {
    const start = nowMs();
    const body: Record<string, unknown> = {
      model,
      max_tokens: clampMaxTokens(options.maxTokens),
      messages,
      stream: true,
    };
    if (options.system) body.system = options.system;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const res = await this.post(body, options);
    if (!res.body) throw new ProviderError("Anthropic streaming returned no body");

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | undefined;

    for await (const event of parseSse(res.body)) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
        options.onToken?.(event.delta.text);
      } else if (event.type === "message_start") {
        inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
      } else if (event.type === "message_delta") {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
        stopReason = event.delta?.stop_reason ?? stopReason;
      }
    }
    assertNotRefusal(text, stopReason);
    return {
      text: text.trim(),
      usage: this.usageFrom(model, inputTokens, outputTokens, start, options),
      stopReason,
    };
  }

  private usage(model: string, res: AnthropicResponse, start: number, options: GenOptions): Usage {
    return this.usageFrom(model, res.usage?.input_tokens ?? 0, res.usage?.output_tokens ?? 0, start, options);
  }
  private usageFrom(model: string, inputTokens: number, outputTokens: number, start: number, options: GenOptions): Usage {
    return {
      model,
      ...(options.promptVersion ? { promptVersion: options.promptVersion } : {}),
      inputTokens,
      outputTokens,
      costUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs: nowMs() - start,
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────

function findToolUse(res: AnthropicResponse, name: string): AnthropicContentBlock | null {
  return (res.content ?? []).find((b) => b.type === "tool_use" && b.name === name) ?? null;
}

function joinText(res: AnthropicResponse): string {
  return (res.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("");
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

interface SseEvent {
  type: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  message?: { usage?: { input_tokens?: number } };
}

/** Parse an Anthropic SSE stream body into typed events. */
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        yield JSON.parse(json) as SseEvent;
      } catch {
        /* skip malformed keep-alive lines */
      }
    }
  }
}

// Wall-clock for latency only (never used for logic/ids) — safe to use Date here.
function nowMs(): number {
  return Date.now();
}
