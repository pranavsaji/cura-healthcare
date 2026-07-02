import { describe, expect, it } from "vitest";
import { type NoteEdit, buildStyleProfile, styleDrift } from "./personalization.js";

describe("styleDrift", () => {
  it("is 0 for identical text and high for a full rewrite", () => {
    expect(styleDrift("client felt anxious", "client felt anxious")).toBe(0);
    expect(styleDrift("client felt anxious", "totally different words entirely")).toBeGreaterThan(0.9);
  });

  it("is 0 when both sides are empty", () => {
    expect(styleDrift("", "")).toBe(0);
  });
});

describe("buildStyleProfile", () => {
  const edits: NoteEdit[] = [
    { sectionKey: "subjective", before: "Client felt sad.", after: "Pt presents with depressed mood and flat affect.", createdAt: "2026-01-01" },
    { sectionKey: "plan", before: "Follow up.", after: "Continue weekly CBT; assign thought-record homework.", createdAt: "2026-02-01" },
    { sectionKey: "objective", before: "Client seemed ok.", after: "Client seemed ok.", createdAt: "2026-03-01" }, // trivial (no drift)
  ];

  it("aggregates the clinician's rewritten phrasings, most recent first", () => {
    const profile = buildStyleProfile("clin-1", edits);
    expect(profile.clinicianId).toBe("clin-1");
    expect(profile.sampleSize).toBe(3);
    // trivial (no-drift) edit excluded; recent first
    expect(profile.exemplars[0]).toMatch(/Continue weekly CBT/);
    expect(profile.exemplars).not.toContain("Client seemed ok.");
  });

  it("caps exemplars and backfills remaining slots with template seeds", () => {
    const profile = buildStyleProfile("clin-1", edits, { maxExemplars: 3, seed: ["Org house style sentence."] });
    expect(profile.exemplars.length).toBeLessThanOrEqual(3);
    expect(profile.exemplars).toContain("Org house style sentence.");
  });

  it("de-duplicates identical exemplars", () => {
    const dupes: NoteEdit[] = [
      { sectionKey: "a", before: "x", after: "Repeated clinical phrasing here." },
      { sectionKey: "b", before: "y", after: "Repeated clinical phrasing here." },
    ];
    const profile = buildStyleProfile("clin-1", dupes);
    expect(profile.exemplars).toEqual(["Repeated clinical phrasing here."]);
  });

  it("returns no learned exemplars when there are no meaningful edits", () => {
    const profile = buildStyleProfile("clin-1", []);
    expect(profile.exemplars).toEqual([]);
    expect(profile.sampleSize).toBe(0);
  });
});
