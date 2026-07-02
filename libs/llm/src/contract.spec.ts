import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { LlmProvider } from "./types.js";
import { MockLlmProvider } from "./mock.js";
import { AnthropicProvider } from "./anthropic.js";

/**
 * The LLM provider CONTRACT. Mock and real (Claude) must both satisfy it so they
 * can't drift (CONVENTIONS §5). The mock always runs; Anthropic runs only when
 * `ANTHROPIC_API_KEY` is set, so the default `pnpm test` needs no key/network.
 */

const NoteSchema = z.object({
  summary: z.string(),
  sections: z
    .array(z.object({ key: z.string(), content: z.string(), evidence: z.array(z.number()).default([]) }))
    .min(1),
  followUpNeeded: z.boolean(),
});

export function runLlmContract(makeProvider: () => LlmProvider): void {
  it("generateStructured returns a schema-valid value with populated Usage", async () => {
    const provider = makeProvider();
    const { value, usage } = await provider.generateStructured(
      NoteSchema,
      "Summarize this session into a structured note.",
      { promptVersion: "note-gen@1" },
    );
    // The core guarantee: the value passes schema.parse().
    expect(() => NoteSchema.parse(value)).not.toThrow();
    expect(usage.model).toBeTruthy();
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(usage.costUsd).toBeGreaterThanOrEqual(0);
    expect(usage.promptVersion).toBe("note-gen@1");
  });

  it("generateText returns text and Usage", async () => {
    const provider = makeProvider();
    const { text, usage } = await provider.generateText("Say hello to a new client.");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(usage.model).toBeTruthy();
    expect(usage.inputTokens).toBeGreaterThan(0);
  });
}

describe("LLM contract — mock", () => {
  runLlmContract(() => new MockLlmProvider());
});

const KEY = process.env.ANTHROPIC_API_KEY;
describe.skipIf(!KEY)("LLM contract — anthropic (keyed)", () => {
  runLlmContract(() => new AnthropicProvider({ apiKey: KEY! }));
});
