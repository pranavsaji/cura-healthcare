import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "./anthropic.js";
import { isNonRetryable } from "./guardrails.js";

/** Build a fake `fetch` returning a JSON Messages response. */
function jsonFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

/** Build a fake `fetch` returning an SSE stream body from raw event lines. */
function sseFetch(events: unknown[]): typeof fetch {
  const body = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
        { status: 200 },
      ),
  ) as unknown as typeof fetch;
}

const NoteSchema = z.object({ summary: z.string(), count: z.number() });

describe("AnthropicProvider — generateText", () => {
  it("sends the right headers and maps content + usage + cost", async () => {
    const fetchImpl = jsonFetch({
      content: [{ type: "text", text: "Hello client." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const provider = new AnthropicProvider({ apiKey: "sk-test", model: "claude-opus-4-8", fetchImpl });
    const { text, usage } = await provider.generateText("greet");
    expect(text).toBe("Hello client.");
    expect(usage.inputTokens).toBe(100);
    expect(usage.costUsd).toBeGreaterThan(0);

    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1];
    expect(init.headers).toMatchObject({ "x-api-key": "sk-test", "anthropic-version": "2023-06-01" });
  });

  it("treats stop_reason=refusal as a non-retryable error", async () => {
    const fetchImpl = jsonFetch({ content: [{ type: "text", text: "" }], stop_reason: "refusal", usage: {} });
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await provider.generateText("x").then(
      () => expect.fail("should reject"),
      (err) => expect(isNonRetryable(err)).toBe(true),
    );
  });

  it("throws a ProviderError on a non-2xx", async () => {
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl: jsonFetch({ error: "boom" }, 500) });
    await expect(provider.generateText("x")).rejects.toThrow(/Anthropic request failed \(500\)/);
  });
});

describe("AnthropicProvider — generateStructured", () => {
  it("uses a forced tool call and returns the validated object", async () => {
    const fetchImpl = jsonFetch({
      content: [{ type: "tool_use", id: "t1", name: "emit_result", input: { summary: "s", count: 3 } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const { value } = await provider.generateStructured(NoteSchema, "make a note");
    expect(value).toEqual({ summary: "s", count: 3 });

    // The request forced the tool.
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1];
    const sent = JSON.parse(init.body as string);
    expect(sent.tool_choice).toEqual({ type: "tool", name: "emit_result" });
    expect(sent.tools[0].name).toBe("emit_result");
  });

  it("repairs exactly once when the first output is invalid, then succeeds", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      const input = call === 1 ? { summary: "s", count: "NOT A NUMBER" } : { summary: "s", count: 7 };
      return new Response(
        JSON.stringify({
          content: [{ type: "tool_use", id: "t", name: "emit_result", input }],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const { value, usage } = await provider.generateStructured(NoteSchema, "x");
    expect(value).toEqual({ summary: "s", count: 7 });
    expect(call).toBe(2); // original + one repair
    // Usage accumulates across both round-trips.
    expect(usage.inputTokens).toBe(20);
  });

  it("throws a non-retryable error when repair still fails", async () => {
    const fetchImpl = jsonFetch({
      content: [{ type: "tool_use", id: "t", name: "emit_result", input: { summary: 1, count: "x" } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await provider.generateStructured(NoteSchema, "x").then(
      () => expect.fail("should reject"),
      (err) => expect(isNonRetryable(err)).toBe(true),
    );
  });
});

describe("AnthropicProvider — streaming", () => {
  it("accumulates text deltas and usage from SSE events", async () => {
    const fetchImpl = sseFetch([
      { type: "message_start", message: { usage: { input_tokens: 42 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 8 } },
    ]);
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const tokens: string[] = [];
    const { text, usage, stopReason } = await provider.generateText("hi", { onToken: (t) => tokens.push(t) });
    expect(text).toBe("Hello");
    expect(tokens).toEqual(["Hel", "lo"]);
    expect(usage.inputTokens).toBe(42);
    expect(usage.outputTokens).toBe(8);
    expect(stopReason).toBe("end_turn");
  });
});

describe("AnthropicProvider — runTools", () => {
  it("executes a tool call then returns the final text", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            content: [{ type: "tool_use", id: "u1", name: "lookup", input: { q: "labs" } }],
            stop_reason: "tool_use",
            usage: { input_tokens: 10, output_tokens: 4 },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Final answer." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 12, output_tokens: 6 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const handler = vi.fn(async () => "result-data");
    const { text, steps } = await provider.runTools("go", [
      { name: "lookup", description: "lookup", schema: z.object({ q: z.string() }), handler },
    ]);
    expect(handler).toHaveBeenCalledWith({ q: "labs" });
    expect(text).toBe("Final answer.");
    expect(steps).toBe(1);
  });
});
