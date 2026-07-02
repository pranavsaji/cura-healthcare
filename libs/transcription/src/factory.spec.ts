import { describe, it, expect, vi } from "vitest";
import { createAsrProvider } from "./factory.js";

describe("createAsrProvider", () => {
  it("defaults to the mock", () => {
    expect(createAsrProvider({ provider: "mock" }).name).toBe("mock");
  });

  it("falls back to mock (and reports) when a real provider has no key", () => {
    const onFallback = vi.fn();
    const dg = createAsrProvider({ provider: "deepgram" }, { onFallback });
    expect(dg.name).toBe("mock");
    expect(onFallback).toHaveBeenCalledOnce();

    const aai = createAsrProvider({ provider: "assemblyai" }, { onFallback });
    expect(aai.name).toBe("mock");
    expect(onFallback).toHaveBeenCalledTimes(2);
  });

  it("builds the real provider when keyed", () => {
    expect(createAsrProvider({ provider: "deepgram", apiKey: "k" }).name).toBe("deepgram");
    expect(createAsrProvider({ provider: "assemblyai", apiKey: "k" }).name).toBe("assemblyai");
  });
});
