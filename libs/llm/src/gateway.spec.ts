import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ProviderError, ValidationError } from "@cura/shared";
import { LlmGateway } from "./gateway.js";
import { nonRetryableProviderError } from "./guardrails.js";
import type { GenStructuredResult, GenTextResult, LlmProvider, RunToolsResult, Usage } from "./types.js";

const noSleep = () => Promise.resolve();
const usage = (over: Partial<Usage> = {}): Usage => ({
  model: "mock",
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  latencyMs: 1,
  ...over,
});

/** A programmable provider whose generateText behavior is scripted per attempt. */
function scriptProvider(script: Array<() => Promise<GenTextResult>>): LlmProvider {
  let i = 0;
  return {
    name: "fake",
    model: "primary-model",
    generateText: () => script[Math.min(i++, script.length - 1)]!(),
    generateStructured: async <T>(): Promise<GenStructuredResult<T>> => ({ value: {} as T, usage: usage() }),
    runTools: async (): Promise<RunToolsResult> => ({ text: "", usage: usage(), steps: 0 }),
  };
}

describe("LlmGateway", () => {
  it("retries a transient provider error then succeeds, accumulating usage", async () => {
    const provider = scriptProvider([
      () => Promise.reject(new ProviderError("503")),
      () => Promise.resolve({ text: "ok", usage: usage() }),
    ]);
    const gw = new LlmGateway(provider, { sleep: noSleep });
    const res = await gw.generateText("hi");
    expect(res.text).toBe("ok");
    expect(gw.totals().calls).toBe(1);
    expect(gw.totals().inputTokens).toBe(10);
  });

  it("does NOT retry a non-retryable error (schema mismatch / refusal)", async () => {
    const call = vi.fn(() => Promise.reject(nonRetryableProviderError("bad schema")));
    const provider = scriptProvider([call]);
    const gw = new LlmGateway(provider, { sleep: noSleep, retryAttempts: 3 });
    await expect(gw.generateText("hi")).rejects.toThrow(/bad schema/);
    expect(call).toHaveBeenCalledOnce(); // one attempt, no retry
  });

  it("does not retry a validation error", async () => {
    const call = vi.fn(() => Promise.reject(new ValidationError("nope")));
    const gw = new LlmGateway(scriptProvider([call]), { sleep: noSleep, retryAttempts: 3 });
    await expect(gw.generateText("hi")).rejects.toBeInstanceOf(ValidationError);
    expect(call).toHaveBeenCalledOnce();
  });

  it("falls back to the fallback model when the primary keeps failing", async () => {
    const models: (string | undefined)[] = [];
    const provider: LlmProvider = {
      name: "fake",
      model: "primary-model",
      generateText: (_p, opts) => {
        models.push(opts?.model);
        if (opts?.model === "fallback-model") return Promise.resolve({ text: "fallback ok", usage: usage() });
        return Promise.reject(new ProviderError("primary down"));
      },
      generateStructured: async <T>(): Promise<GenStructuredResult<T>> => ({ value: {} as T, usage: usage() }),
      runTools: async (): Promise<RunToolsResult> => ({ text: "", usage: usage(), steps: 0 }),
    };
    const gw = new LlmGateway(provider, { sleep: noSleep, retryAttempts: 2, fallbackModel: "fallback-model" });
    const res = await gw.generateText("hi");
    expect(res.text).toBe("fallback ok");
    expect(models).toContain("fallback-model");
  });

  it("reports usage via onUsage and delegates generateStructured", async () => {
    const seen: Usage[] = [];
    const gw = new LlmGateway(scriptProvider([() => Promise.resolve({ text: "x", usage: usage() })]), {
      sleep: noSleep,
      onUsage: (u) => seen.push(u),
    });
    await gw.generateStructured(z.object({}), "hi");
    expect(seen).toHaveLength(1);
  });
});
