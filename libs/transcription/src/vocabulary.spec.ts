import { describe, it, expect } from "vitest";
import {
  BEHAVIORAL_HEALTH_TERMS,
  DEFAULT_VOCABULARY,
  buildVocabulary,
  toKeywordBoosts,
  toDeepgramKeywords,
} from "./vocabulary.js";

describe("vocabulary", () => {
  it("default list includes BH terms and is de-duplicated", () => {
    expect(DEFAULT_VOCABULARY).toContain("CBT");
    expect(DEFAULT_VOCABULARY).toContain("suicidal ideation");
    expect(new Set(DEFAULT_VOCABULARY).size).toBe(DEFAULT_VOCABULARY.length);
  });

  it("buildVocabulary merges extras, trims, drops blanks, de-dupes case-insensitively", () => {
    const vocab = buildVocabulary(["  Ketamine ", "cbt", ""]);
    expect(vocab).toContain("Ketamine");
    // "cbt" duplicates the built-in "CBT" (case-insensitive) → not added twice.
    expect(vocab.filter((t) => t.toLowerCase() === "cbt")).toHaveLength(1);
    expect(vocab).not.toContain("");
  });

  it("boosts multi-word phrases higher than single words", () => {
    const boosts = toKeywordBoosts(["panic attack", "PTSD"], 2);
    const phrase = boosts.find((b) => b.term === "panic attack");
    const single = boosts.find((b) => b.term === "PTSD");
    expect(phrase?.boost).toBe(3);
    expect(single?.boost).toBe(2);
  });

  it("renders Deepgram keyword params as term:boost", () => {
    const kws = toDeepgramKeywords(["PTSD"], 2);
    expect(kws).toContain("PTSD:2");
  });

  it("BH term list is non-empty", () => {
    expect(BEHAVIORAL_HEALTH_TERMS.length).toBeGreaterThan(10);
  });
});
