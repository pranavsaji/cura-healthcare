import { describe, it, expect } from "vitest";
import { DiarizationMapper, normalizeSpeaker } from "./diarization.js";
import type { Speaker } from "./types.js";

describe("normalizeSpeaker", () => {
  it("passes through explicit role words", () => {
    const a = new Map<string, Speaker>();
    expect(normalizeSpeaker("therapist", a)).toBe("clinician");
    expect(normalizeSpeaker("patient", a)).toBe("client");
    expect(normalizeSpeaker("UNKNOWN", a)).toBe("unknown");
  });

  it("maps null/blank to unknown", () => {
    const a = new Map<string, Speaker>();
    expect(normalizeSpeaker(null, a)).toBe("unknown");
    expect(normalizeSpeaker(undefined, a)).toBe("unknown");
    expect(normalizeSpeaker("  ", a)).toBe("unknown");
  });

  it("assigns opaque provider labels first→clinician, second→client, rest→unknown", () => {
    const a = new Map<string, Speaker>();
    expect(normalizeSpeaker(0, a)).toBe("clinician");
    expect(normalizeSpeaker(1, a)).toBe("client");
    expect(normalizeSpeaker(2, a)).toBe("unknown");
    // Stable: re-seeing a label returns the same role.
    expect(normalizeSpeaker(1, a)).toBe("client");
    expect(normalizeSpeaker(0, a)).toBe("clinician");
  });
});

describe("DiarizationMapper", () => {
  it("is stable across a stream and exposes its assignment", () => {
    const m = new DiarizationMapper();
    expect(m.map("A")).toBe("clinician");
    expect(m.map("B")).toBe("client");
    expect(m.map("A")).toBe("clinician");
    expect(m.snapshot()).toEqual({ a: "clinician", b: "client" });
  });

  it("honors a fixed speaker (dictation) regardless of provider label", () => {
    const m = new DiarizationMapper("client");
    expect(m.map(0)).toBe("client");
    expect(m.map("clinician")).toBe("client");
  });
});
