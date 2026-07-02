import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { MockLlmProvider } from "./mock.js";

describe("MockLlmProvider", () => {
  it("generateText echoes deterministically and streams tokens", async () => {
    const provider = new MockLlmProvider();
    const tokens: string[] = [];
    const { text, usage } = await provider.generateText("Hello there\nsecond line", {
      onToken: (t) => tokens.push(t),
    });
    expect(text).toContain("Hello there");
    expect(tokens.join("")).toBe(text + " ");
    expect(usage.costUsd).toBe(0);
    expect(usage.inputTokens).toBeGreaterThan(0);
  });

  it("generateStructured returns schema-valid output derived from the schema", async () => {
    const provider = new MockLlmProvider();
    const schema = z.object({ title: z.string(), items: z.array(z.number()).min(1) });
    const { value } = await provider.generateStructured(schema, "make one");
    expect(() => schema.parse(value)).not.toThrow();
  });

  it("honors an injected structured responder", async () => {
    const provider = new MockLlmProvider({
      responders: { structured: () => ({ title: "scripted", items: [1, 2] }) },
    });
    const schema = z.object({ title: z.string(), items: z.array(z.number()) });
    const { value } = await provider.generateStructured(schema, "x");
    expect(value).toEqual({ title: "scripted", items: [1, 2] });
  });

  it("runTools invokes the first tool once and reports steps", async () => {
    const provider = new MockLlmProvider();
    const handler = vi.fn(async () => "42");
    const { text, steps } = await provider.runTools("compute", [
      { name: "calc", description: "calc", schema: z.object({ x: z.number() }), handler },
    ]);
    expect(handler).toHaveBeenCalledOnce();
    expect(steps).toBe(1);
    expect(text).toContain("calc");
  });

  it("runTools with no tools falls back to text (0 steps)", async () => {
    const provider = new MockLlmProvider();
    const { steps } = await provider.runTools("hi", []);
    expect(steps).toBe(0);
  });
});
