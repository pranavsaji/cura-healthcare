import type { z } from "zod";
import { ProviderError } from "@cura/shared";
import {
  assertNotRefusal,
  clampMaxTokens,
  clampTimeout,
  estimateCost,
  estimateTokens,
  minimizePhi,
  nonRetryableProviderError,
  validateStructured,
} from "./guardrails.js";
import { zodToJsonSchema } from "./schema.js";
import { parseSseJson } from "./sse.js";
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
 * DeepSeek provider over the OpenAI-compatible Chat Completions API (`fetch`,
 * no SDK — CONVENTIONS §2). Structured output uses a FORCED function call
 * (`tool_choice: {type:"function"}`); `function.arguments` arrives as a JSON
 * *string*, so a malformed string is treated the same as a schema mismatch and
 * gets exactly one repair round-trip before failing typed. Quirks handled:
 * no top-level `system` param (system rides as the first message), every
 * `tool_call_id` must receive a `role:"tool"` reply, and the final streamed
 * chunk has an empty `choices` array carrying only `usage`.
 */

const API_URL = "https://api.deepseek.com/chat/completions";

interface DsToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface DsMessage {
  role?: string;
  content?: string | null;
  tool_calls?: DsToolCall[];
}
interface DsChoice {
  message?: DsMessage;
  finish_reason?: string;
  delta?: { content?: string | null };
}
interface DsResponse {
  choices?: DsChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: DsToolCall[];
  tool_call_id?: string;
};

export interface DeepSeekOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class DeepSeekProvider implements LlmProvider {
  readonly name = "deepseek";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeepSeekOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "deepseek-chat";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateText(prompt: string, options: GenOptions = {}): Promise<GenTextResult> {
    const model = options.model ?? this.model;
    const messages = withSystem([{ role: "user", content: minimizePhi(prompt) }], options);
    if (options.onToken) return this.streamText(model, messages, options);

    const start = nowMs();
    const res = await this.call({ model, messages, options });
    const choice = res.choices?.[0];
    const text = (choice?.message?.content ?? "").trim();
    assertNotRefusal(text, normalizeStopReason(choice?.finish_reason));
    return { text, usage: this.usage(model, res, start, options), stopReason: choice?.finish_reason };
  }

  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options: GenOptions = {},
  ): Promise<GenStructuredResult<T>> {
    const model = options.model ?? this.model;
    const toolName = "emit_result";
    const tool = {
      type: "function",
      function: { name: toolName, description: "Return the result as structured data.", parameters: zodToJsonSchema(schema) },
    };
    const toolChoice = { type: "function", function: { name: toolName } };
    const messages = withSystem([{ role: "user", content: minimizePhi(prompt) }], options);

    const start = nowMs();
    let res = await this.call({ model, messages, options, tools: [tool], toolChoice });
    let usageInput = res.usage?.prompt_tokens ?? 0;
    let usageOutput = res.usage?.completion_tokens ?? 0;
    let call = res.choices?.[0]?.message?.tool_calls?.[0] ?? null;

    let validated = call ? validateStructured(schema, parseArguments(call)) : null;
    if (!validated || !validated.ok) {
      // One repair round-trip: show the model its invalid output + the errors.
      // A role:"tool" reply is only legal after an assistant tool_calls message,
      // so when no call came back the feedback rides a plain user message.
      const errorDetail = validated && !validated.ok ? JSON.stringify(validated.error.details) : "no tool call returned";
      const feedback = `Your output failed validation: ${errorDetail}. Call ${toolName} again with corrected data that matches the schema exactly.`;
      const repairMessages: Message[] = call
        ? [...messages, { role: "assistant", content: null, tool_calls: [call] }, { role: "tool", tool_call_id: call.id, content: feedback }]
        : [...messages, { role: "assistant", content: "…" }, { role: "user", content: feedback }];
      res = await this.call({ model, messages: repairMessages, options, tools: [tool], toolChoice });
      usageInput += res.usage?.prompt_tokens ?? 0;
      usageOutput += res.usage?.completion_tokens ?? 0;
      call = res.choices?.[0]?.message?.tool_calls?.[0] ?? null;
      validated = call ? validateStructured(schema, parseArguments(call)) : null;
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
    const toolDefs = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: zodToJsonSchema(t.schema) },
    }));
    const byName = new Map(tools.map((t) => [t.name, t] as const));
    const messages = withSystem([{ role: "user", content: minimizePhi(prompt) }], options);

    const start = nowMs();
    let totalIn = 0;
    let totalOut = 0;
    let steps = 0;

    for (let i = 0; i < maxSteps; i++) {
      const res = await this.call({ model, messages, options, tools: toolDefs, toolChoice: "auto" });
      totalIn += res.usage?.prompt_tokens ?? 0;
      totalOut += res.usage?.completion_tokens ?? 0;
      const choice = res.choices?.[0];
      const toolCalls = choice?.message?.tool_calls ?? [];
      // Guard on the array, not finish_reason alone — some compatible backends
      // report "stop" even when tool_calls are present.
      if (toolCalls.length === 0) {
        const text = (choice?.message?.content ?? "").trim();
        assertNotRefusal(text, normalizeStopReason(choice?.finish_reason));
        return { text, usage: this.usageFrom(model, totalIn, totalOut, start, options), steps };
      }
      // Execute each requested call; EVERY tool_call_id must get a reply.
      messages.push({ role: "assistant", content: choice?.message?.content ?? null, tool_calls: toolCalls });
      for (const use of toolCalls) {
        steps += 1;
        const tool = byName.get(use.function.name);
        let content: string;
        if (!tool) content = `error: unknown tool ${use.function.name}`;
        else {
          let args: unknown;
          try {
            args = JSON.parse(use.function.arguments);
          } catch {
            args = undefined;
          }
          const parsed = tool.schema.safeParse(args);
          content = parsed.success
            ? await tool.handler(parsed.data)
            : `error: invalid arguments (${parsed.error.issues.map((x) => x.message).join(", ")})`;
        }
        messages.push({ role: "tool", tool_call_id: use.id, content });
      }
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
  }): Promise<DsResponse> {
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: clampMaxTokens(args.options.maxTokens),
      messages: args.messages,
    };
    if (args.options.temperature !== undefined) body.temperature = args.options.temperature;
    if (args.tools) body.tools = args.tools;
    if (args.toolChoice) body.tool_choice = args.toolChoice;

    const res = await this.post(body, args.options);
    return (await res.json()) as DsResponse;
  }

  private async post(body: unknown, options: GenOptions): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), clampTimeout(options.timeoutMs));
    try {
      const res = await this.fetchImpl(API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await safeText(res);
        throw new ProviderError(`DeepSeek request failed (${res.status})`, { details: { status: res.status, detail } });
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
      stream_options: { include_usage: true },
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const res = await this.post(body, options);
    if (!res.body) throw new ProviderError("DeepSeek streaming returned no body");

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | undefined;

    for await (const chunk of parseSseJson<DsResponse>(res.body)) {
      // The final chunk has an empty `choices` array and carries only `usage`.
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        text += delta;
        options.onToken?.(delta);
      }
      if (choice?.finish_reason) stopReason = choice.finish_reason;
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }
    }
    // Usage may be absent if the stream aborts early — estimate, never report 0.
    if (inputTokens === 0) inputTokens = estimateTokens(messages.map((m) => m.content ?? "").join("\n"));
    if (outputTokens === 0 && text) outputTokens = estimateTokens(text);
    assertNotRefusal(text, normalizeStopReason(stopReason));
    return {
      text: text.trim(),
      usage: this.usageFrom(model, inputTokens, outputTokens, start, options),
      stopReason,
    };
  }

  private usage(model: string, res: DsResponse, start: number, options: GenOptions): Usage {
    return this.usageFrom(model, res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0, start, options);
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

/** DeepSeek has no top-level `system` param — it rides as the first message. */
function withSystem(messages: Message[], options: GenOptions): Message[] {
  return options.system ? [{ role: "system", content: options.system }, ...messages] : messages;
}

/** `function.arguments` is a JSON string; malformed JSON is a repairable failure. */
function parseArguments(call: DsToolCall): unknown {
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    return undefined;
  }
}

/**
 * DeepSeek never emits `stop_reason:"refusal"`; `content_filter` is its closest
 * signal, so map it onto the shared refusal handling in guardrails.
 */
function normalizeStopReason(finishReason?: string): string | undefined {
  return finishReason === "content_filter" ? "refusal" : finishReason;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

// Wall-clock for latency only (never used for logic/ids) — safe to use Date here.
function nowMs(): number {
  return Date.now();
}
