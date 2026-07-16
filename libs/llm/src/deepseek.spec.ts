import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { DeepSeekProvider } from "./deepseek.js";
import { isNonRetryable } from "./guardrails.js";

/** Build a fake `fetch` returning a JSON Chat Completions response. */
function jsonFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

/** Build a fake `fetch` returning an SSE stream body from raw chunk objects. */
function sseFetch(chunks: unknown[]): typeof fetch {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
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

function sentBody(fetchImpl: typeof fetch, call = 0): Record<string, unknown> {
  const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[call]![1];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const NoteSchema = z.object({ summary: z.string(), count: z.number() });

describe("DeepSeekProvider — generateText", () => {
  it("sends Bearer auth and maps content + usage + cost", async () => {
    const fetchImpl = jsonFetch({
      choices: [{ message: { role: "assistant", content: "Hello client." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
    const provider = new DeepSeekProvider({ apiKey: "sk-test", model: "deepseek-chat", fetchImpl });
    const { text, usage } = await provider.generateText("greet");
    expect(text).toBe("Hello client.");
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(20);
    expect(usage.costUsd).toBeGreaterThan(0);

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.headers).toMatchObject({ authorization: "Bearer sk-test" });
  });

  it("rides the system prompt as the first message (no top-level param)", async () => {
    const fetchImpl = jsonFetch({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: {},
    });
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    await provider.generateText("hi", { system: "be brief" });
    const body = sentBody(fetchImpl);
    expect(body.system).toBeUndefined();
    expect((body.messages as { role: string; content: string }[])[0]).toEqual({ role: "system", content: "be brief" });
  });

  it("treats finish_reason=content_filter as a non-retryable refusal", async () => {
    const fetchImpl = jsonFetch({
      choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
      usage: {},
    });
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    await provider.generateText("x").then(
      () => expect.fail("should reject"),
      (err) => expect(isNonRetryable(err)).toBe(true),
    );
  });

  it("throws a ProviderError on a non-2xx", async () => {
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl: jsonFetch({ error: "boom" }, 500) });
    await expect(provider.generateText("x")).rejects.toThrow(/DeepSeek request failed \(500\)/);
  });
});

describe("DeepSeekProvider — generateStructured", () => {
  const toolCall = (args: string, id = "c1") => ({
    id,
    type: "function" as const,
    function: { name: "emit_result", arguments: args },
  });

  it("forces the function call and parses arguments (a JSON string)", async () => {
    const fetchImpl = jsonFetch({
      choices: [{ message: { tool_calls: [toolCall(JSON.stringify({ summary: "s", count: 3 }))] }, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    });
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    const { value } = await provider.generateStructured(NoteSchema, "make a note");
    expect(value).toEqual({ summary: "s", count: 3 });

    const body = sentBody(fetchImpl);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "emit_result" } });
    expect((body.tools as { function: { name: string; parameters: unknown } }[])[0]!.function.name).toBe("emit_result");
    expect((body.tools as { function: { parameters: unknown } }[])[0]!.function.parameters).toBeTruthy();
  });

  it("repairs exactly once when the first output is invalid, then succeeds", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      const args = call === 1 ? JSON.stringify({ summary: "s", count: "NOT A NUMBER" }) : JSON.stringify({ summary: "s", count: 7 });
      return new Response(
        JSON.stringify({
          choices: [{ message: { tool_calls: [toolCall(args, `c${call}`)] }, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    const { value, usage } = await provider.generateStructured(NoteSchema, "x");
    expect(value).toEqual({ summary: "s", count: 7 });
    expect(call).toBe(2); // original + one repair
    expect(usage.inputTokens).toBe(20); // accumulates across both round-trips

    // The repair conversation replays the bad call and answers its tool_call_id.
    const repair = sentBody(fetchImpl, 1);
    const messages = repair.messages as { role: string; tool_call_id?: string }[];
    expect(messages.at(-2)?.role).toBe("assistant");
    expect(messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  it("treats unparseable argument JSON as repairable", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      const args = call === 1 ? "{not json" : JSON.stringify({ summary: "s", count: 1 });
      return new Response(
        JSON.stringify({
          choices: [{ message: { tool_calls: [toolCall(args)] }, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    const { value } = await provider.generateStructured(NoteSchema, "x");
    expect(value).toEqual({ summary: "s", count: 1 });
    expect(call).toBe(2);
  });

  it("throws a non-retryable error when repair still fails", async () => {
    const fetchImpl = jsonFetch({
      choices: [{ message: { tool_calls: [toolCall(JSON.stringify({ summary: 1, count: "x" }))] }, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    await provider.generateStructured(NoteSchema, "x").then(
      () => expect.fail("should reject"),
      (err) => expect(isNonRetryable(err)).toBe(true),
    );
  });
});

describe("DeepSeekProvider — streaming", () => {
  it("accumulates deltas and reads usage from the final empty-choices chunk", async () => {
    const fetchImpl = sseFetch([
      { choices: [{ delta: { content: "Hel" } }] },
      { choices: [{ delta: { content: "lo" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 42, completion_tokens: 8 } }, // final usage-only chunk
    ]);
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    const tokens: string[] = [];
    const { text, usage, stopReason } = await provider.generateText("hi", { onToken: (t) => tokens.push(t) });
    expect(text).toBe("Hello");
    expect(tokens).toEqual(["Hel", "lo"]);
    expect(usage.inputTokens).toBe(42);
    expect(usage.outputTokens).toBe(8);
    expect(stopReason).toBe("stop");

    const body = sentBody(fetchImpl);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("falls back to token estimates when the stream carries no usage", async () => {
    const fetchImpl = sseFetch([{ choices: [{ delta: { content: "Hi" }, finish_reason: "stop" }] }]);
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    const { usage } = await provider.generateText("hello there", { onToken: () => {} });
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });
});

describe("DeepSeekProvider — runTools", () => {
  it("executes a tool call, answers its tool_call_id, then returns the final text", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [{ id: "u1", type: "function", function: { name: "lookup", arguments: JSON.stringify({ q: "labs" }) } }],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 4 },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Final answer." }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 6 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: "k", fetchImpl });
    const handler = vi.fn(async () => "result-data");
    const { text, steps } = await provider.runTools("go", [
      { name: "lookup", description: "lookup", schema: z.object({ q: z.string() }), handler },
    ]);
    expect(handler).toHaveBeenCalledWith({ q: "labs" });
    expect(text).toBe("Final answer.");
    expect(steps).toBe(1);

    // Second request must reply to the tool_call_id with a role:"tool" message.
    const body = sentBody(fetchImpl, 1);
    const messages = body.messages as { role: string; tool_call_id?: string; content?: string }[];
    expect(messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "u1", content: "result-data" });
    expect(messages.at(-2)?.role).toBe("assistant");
  });
});
