import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "@cura/llm";
import type { RiskFlag, TranscriptSegment } from "@cura/shared";
import { RiskScanner, mergeFlags, scanRiskRules } from "./risk.js";

const seg = (start: number, speaker: TranscriptSegment["speaker"], text: string): TranscriptSegment => ({
  start,
  end: start + 4,
  speaker,
  text,
  confidence: 1,
});

describe("risk rules", () => {
  it("flags suicidal ideation as critical", () => {
    const flags = scanRiskRules([seg(10, "client", "Sometimes I just want to end my life.")]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "suicidal_ideation", severity: "critical", segmentStart: 10 });
  });

  it("flags homicidal ideation, abuse, and mandated-reporting indicators", () => {
    const hi = scanRiskRules([seg(0, "client", "I want to hurt them so badly.")]);
    expect(hi[0]?.kind).toBe("homicidal_ideation");

    const abuse = scanRiskRules([seg(0, "client", "My partner hit me again last night.")]);
    expect(abuse[0]?.kind).toBe("abuse");

    const mandated = scanRiskRules([seg(0, "client", "I have been neglecting my child lately.")]);
    expect(mandated[0]?.kind).toBe("mandated_reporting");
  });

  it("returns nothing for a benign transcript", () => {
    expect(scanRiskRules([seg(0, "client", "I had a calm and productive week.")])).toEqual([]);
  });
});

describe("mergeFlags", () => {
  it("dedupes on kind+segmentStart and keeps the highest severity", () => {
    const a: RiskFlag = { kind: "suicidal_ideation", severity: "warning", quote: "x", segmentStart: 5 };
    const b: RiskFlag = { kind: "suicidal_ideation", severity: "critical", quote: "x", segmentStart: 5 };
    const merged = mergeFlags([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.severity).toBe("critical");
  });

  it("sorts by segment start", () => {
    const merged = mergeFlags(
      [{ kind: "abuse", severity: "warning", quote: "b", segmentStart: 20 }],
      [{ kind: "abuse", severity: "warning", quote: "a", segmentStart: 3 }],
    );
    expect(merged.map((f) => f.segmentStart)).toEqual([3, 20]);
  });
});

describe("RiskScanner", () => {
  it("returns rule hits only when verification is off", async () => {
    const scanner = new RiskScanner(new MockLlmProvider());
    const flags = await scanner.scan([seg(0, "client", "I want to end my life.")]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("suicidal_ideation");
  });

  it("never drops a rule hit even when the LLM returns nothing", async () => {
    const llm = new MockLlmProvider({ responders: { structured: () => ({ flags: [] }) } });
    const scanner = new RiskScanner(llm);
    const flags = await scanner.scan([seg(0, "client", "I want to end my life.")], { verify: true });
    expect(flags.some((f) => f.kind === "suicidal_ideation")).toBe(true);
  });

  it("augments with additional LLM-found flags (precision layer)", async () => {
    const llm = new MockLlmProvider({
      responders: {
        structured: () => ({
          flags: [{ kind: "mandated_reporting", severity: "warning", quote: "elder concern", segmentStart: 12 }],
        }),
      },
    });
    const scanner = new RiskScanner(llm);
    const flags = await scanner.scan([seg(12, "client", "A benign line the rules ignore.")], { verify: true });
    expect(flags.some((f) => f.kind === "mandated_reporting")).toBe(true);
  });
});
