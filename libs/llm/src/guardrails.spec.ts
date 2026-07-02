import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  estimateCost,
  estimateTokens,
  clampMaxTokens,
  clampTimeout,
  validateStructured,
  isRefusal,
  assertNotRefusal,
  isNonRetryable,
  minimizePhi,
  LIMITS,
} from "./guardrails.js";

describe("cost + tokens", () => {
  it("prices known models and zero for unknown/mock", () => {
    expect(estimateCost("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(90);
    expect(estimateCost("mock", 1000, 1000)).toBe(0);
    expect(estimateCost("nonexistent", 1000, 1000)).toBe(0);
  });
  it("estimates tokens ~4 chars/token, min 1", () => {
    expect(estimateTokens("")).toBe(1);
    expect(estimateTokens("12345678")).toBe(2);
  });
});

describe("limit clamps", () => {
  it("clamps output tokens to the ceiling and floors", () => {
    expect(clampMaxTokens(999_999)).toBe(LIMITS.maxOutputTokens);
    expect(clampMaxTokens(undefined)).toBe(LIMITS.defaultOutputTokens);
    expect(clampMaxTokens(0)).toBe(1);
  });
  it("clamps timeout within bounds", () => {
    expect(clampTimeout(10)).toBe(1000);
    expect(clampTimeout(9_999_999)).toBe(LIMITS.maxTimeoutMs);
  });
});

describe("validateStructured", () => {
  const schema = z.object({ a: z.string() });
  it("returns ok for valid input", () => {
    const r = validateStructured(schema, { a: "x" });
    expect(r.ok).toBe(true);
  });
  it("returns a ValidationError result for invalid input", () => {
    const r = validateStructured(schema, { a: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation_error");
  });
});

describe("refusal handling", () => {
  it("detects stop_reason refusal and text patterns", () => {
    expect(isRefusal("anything", "refusal")).toBe(true);
    expect(isRefusal("I can't help with that request.")).toBe(true);
    expect(isRefusal("Here is your note.")).toBe(false);
  });
  it("throws a non-retryable ProviderError", () => {
    try {
      assertNotRefusal("", "refusal");
      throw new Error("should have thrown");
    } catch (err) {
      expect(isNonRetryable(err)).toBe(true);
    }
  });
});

describe("minimizePhi", () => {
  it("scrubs obvious raw identifiers", () => {
    const scrubbed = minimizePhi("SSN 123-45-6789 email a@b.com phone 555-123-4567 MRN:ABC123");
    expect(scrubbed).toContain("[SSN]");
    expect(scrubbed).toContain("[EMAIL]");
    expect(scrubbed).toContain("[PHONE]");
    expect(scrubbed).toContain("[MRN]");
    expect(scrubbed).not.toContain("123-45-6789");
  });
});
