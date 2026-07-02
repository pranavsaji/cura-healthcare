import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createLlm } from "./factory.js";

describe("createLlm", () => {
  it("wraps the mock by default and works end-to-end", async () => {
    const llm = createLlm({ provider: "mock" });
    expect(llm.name).toBe("gateway:mock");
    const { value } = await llm.generateStructured(z.object({ a: z.string() }), "x");
    expect(() => z.object({ a: z.string() }).parse(value)).not.toThrow();
  });

  it("falls back to mock (and reports) when anthropic has no key", () => {
    const onFallback = vi.fn();
    const llm = createLlm({ provider: "anthropic" }, { onFallback });
    expect(llm.name).toBe("gateway:mock");
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("builds the anthropic provider when keyed", () => {
    const llm = createLlm({ provider: "anthropic", apiKey: "k", model: "claude-sonnet-5" });
    expect(llm.name).toBe("gateway:anthropic");
    expect(llm.model).toBe("claude-sonnet-5");
  });
});
