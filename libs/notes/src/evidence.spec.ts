import { describe, expect, it } from "vitest";
import type { NoteSection, TranscriptSegment } from "@cura/shared";
import { linkEvidence, linkSectionEvidence, splitClaims } from "./evidence.js";

const transcript: TranscriptSegment[] = [
  { speaker: "client", start: 0, end: 4, text: "I have been feeling very anxious and my sleep has been terrible this week.", confidence: 1 },
  { speaker: "clinician", start: 4, end: 8, text: "We practiced a grounding breathing technique together.", confidence: 1 },
  { speaker: "client", start: 8, end: 12, text: "The breathing helped me feel calmer afterwards.", confidence: 1 },
];

describe("evidence linking", () => {
  it("splits content into sentence-level claims", () => {
    expect(splitClaims("Client felt anxious. Sleep was poor.\nBreathing helped.")).toEqual([
      "Client felt anxious.",
      "Sleep was poor.",
      "Breathing helped.",
    ]);
  });

  it("keeps valid evidence and grounds well-supported content", () => {
    const section: NoteSection = {
      key: "subjective",
      title: "Subjective",
      content: "Client reported feeling anxious with terrible sleep this week.",
      evidence: [0],
    };
    const { section: linked, unmapped } = linkSectionEvidence(section, transcript);
    expect(linked.evidence).toEqual([0]);
    expect(unmapped).toEqual([]);
  });

  it("drops dangling evidence references and flags them", () => {
    const section: NoteSection = {
      key: "subjective",
      title: "Subjective",
      content: "Client reported feeling anxious with terrible sleep this week.",
      evidence: [0, 99], // 99 is not a real segment start
    };
    const { section: linked, unmapped } = linkSectionEvidence(section, transcript);
    expect(linked.evidence).toEqual([0]);
    expect(unmapped.some((u) => u.reason === "dangling_reference")).toBe(true);
  });

  it("flags a section with clinical content but no evidence (no_evidence)", () => {
    const section: NoteSection = {
      key: "assessment",
      title: "Assessment",
      content: "Client is making measurable progress toward treatment goals.",
      evidence: [],
    };
    const { unmapped } = linkSectionEvidence(section, transcript);
    expect(unmapped.some((u) => u.reason === "no_evidence")).toBe(true);
  });

  it("flags a fabricated claim whose words are absent from the transcript", () => {
    const section: NoteSection = {
      key: "subjective",
      title: "Subjective",
      content:
        "Client reported feeling anxious with terrible sleep. The client won the lottery and bought a yacht yesterday.",
      evidence: [0],
    };
    const { unmapped } = linkSectionEvidence(section, transcript);
    const fabricated = unmapped.find((u) => u.reason === "unsupported_content");
    expect(fabricated).toBeDefined();
    expect(fabricated!.claim).toMatch(/lottery/);
  });

  it("does not flag short boilerplate/guidance echoes as claims", () => {
    const section: NoteSection = {
      key: "plan",
      title: "Plan",
      content: "Next steps.",
      evidence: [4],
    };
    const { unmapped } = linkSectionEvidence(section, transcript);
    expect(unmapped).toEqual([]);
  });

  it("links across all sections of a note", () => {
    const sections: NoteSection[] = [
      { key: "s1", title: "S1", content: "Client felt anxious about sleep.", evidence: [0] },
      { key: "s2", title: "S2", content: "The clinician practiced grounding breathing.", evidence: [4] },
    ];
    const result = linkEvidence(sections, transcript);
    expect(result.sections).toHaveLength(2);
    expect(result.unmapped).toEqual([]);
  });
});
