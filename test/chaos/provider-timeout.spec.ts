import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  LlmGateway,
  type GenOptions,
  type GenStructuredResult,
  type GenTextResult,
  type LlmProvider,
} from "../../libs/llm/src/index.js";
import { ProviderError, isAppError } from "../../libs/shared/src/index.js";

/**
 * Phase 16 chaos — provider timeout / fault injection. Proves the LLM gateway
 * degrades GRACEFULLY when the upstream provider fails: transient errors are
 * retried, a persistent failure surfaces as a TYPED `ProviderError` (mappable to
 * a safe 502 — never an unhandled crash), and a fallback model recovers the call.
 * Deterministic: retry sleep is a noop, so no wall-clock time is spent.
 */

const USAGE = { model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 0 };

/** A provider whose behaviour is scripted per attempt / per model. */
function fakeProvider(behaviour: (model: string | undefined, attempt: number) => "timeout" | "ok"): {
  provider: LlmProvider;
  attempts: () => number;
} {
  let attempt = 0;
  const provider: LlmProvider = {
    name: "fake",
    model: "primary",
    async generateText(_p: string, o: GenOptions = {}): Promise<GenTextResult> {
      attempt += 1;
      if (behaviour(o.model, attempt) === "timeout") {
        throw new ProviderError("upstream timeout", { details: { kind: "timeout" } });
      }
      return { text: "ok", usage: USAGE };
    },
    async generateStructured<T>(schema: z.ZodType<T>): Promise<GenStructuredResult<T>> {
      return { value: schema.parse({}), usage: USAGE };
    },
    async runTools() {
      return { text: "ok", usage: USAGE, steps: 0 };
    },
  };
  return { provider, attempts: () => attempt };
}

describe("chaos · LLM provider timeout", () => {
  it("retries transient timeouts then surfaces a TYPED ProviderError (no crash)", async () => {
    const { provider, attempts } = fakeProvider(() => "timeout");
    const gateway = new LlmGateway(provider, { retryAttempts: 3, sleep: async () => {} });

    const err = await gateway.generateText("hi").then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(isAppError(err)).toBe(true);
    // 502 is the safe status the API maps this to — degradation, not a 500.
    expect((err as ProviderError).httpStatus).toBe(502);
    expect(attempts()).toBe(3); // all attempts exhausted
  });

  it("recovers via the fallback model when the primary keeps timing out", async () => {
    // Primary model times out; the fallback model succeeds.
    const { provider } = fakeProvider((model) => (model === "backup" ? "ok" : "timeout"));
    const gateway = new LlmGateway(provider, {
      retryAttempts: 2,
      fallbackModel: "backup",
      sleep: async () => {},
    });

    const res = await gateway.generateText("hi");
    expect(res.text).toBe("ok");
    expect(gateway.totals().calls).toBe(1);
  });
});
