import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "@cura/llm";
import { NoteFormat, type NoteSection, type TranscriptSegment, sectionsForFormat } from "@cura/shared";
import { NoteEngine } from "@cura/notes";

/**
 * Phase 11 acceptance gate, end to end against the deterministic `@cura/llm`
 * mock: known transcript → schema-valid sections; a fabricated claim is flagged;
 * a suicidal-ideation phrase yields a critical flag; personalization changes the
 * prompt. No network, no randomness (CONVENTIONS §5).
 */

const baseTranscript: TranscriptSegment[] = [
  { speaker: "client", start: 0, end: 5, text: "I have felt anxious all week and my sleep has been terrible.", confidence: 1 },
  { speaker: "clinician", start: 5, end: 9, text: "We practiced a grounding breathing technique.", confidence: 1 },
  { speaker: "client", start: 9, end: 13, text: "The breathing helped and I felt calmer afterward.", confidence: 1 },
];

/** Grounded responder: content drawn from the transcript, real evidence starts. */
function groundedResponder() {
  return {
    structured: (_s: unknown, prompt: string) => {
      const title = /Write the "([^"]+)" section/.exec(prompt)?.[1] ?? "Section";
      return {
        content: `${title}: client felt anxious with terrible sleep; practiced grounding breathing and felt calmer.`,
        evidence: [0, 5, 9],
      };
    },
  };
}

describe("NoteEngine (integration, mock LLM)", () => {
  it("generates sections matching the chosen format's schema", async () => {
    const engine = new NoteEngine(new MockLlmProvider({ responders: groundedResponder() }));
    const result = await engine.generate({ format: "SOAP", transcript: baseTranscript, clientLabel: "Client A" });

    // Every section is schema-valid and matches the SOAP section keys, in order.
    for (const s of result.sections) expect(() => NoteSectionParse(s)).not.toThrow();
    expect(result.sections.map((s) => s.key)).toEqual(sectionsForFormat("SOAP").map((s) => s.key));
    expect(NoteFormat.parse(result.format)).toBe("SOAP");
    // Fully grounded content → no unmapped claims.
    expect(result.unmapped).toEqual([]);
    // Every retained section carries ≥1 evidence link.
    for (const s of result.sections) expect(s.evidence.length).toBeGreaterThanOrEqual(1);
  });

  it("flags a fabricated claim with no transcript support", async () => {
    const engine = new NoteEngine(
      new MockLlmProvider({
        responders: { structured: () => ({ content: "Client reported winning the lottery and buying a yacht.", evidence: [] }) },
      }),
    );
    const result = await engine.generate({ format: "DAP", transcript: baseTranscript, clientLabel: "Client A" });
    expect(result.unmapped.length).toBeGreaterThan(0);
  });

  it("produces a critical suicidal_ideation flag from a trigger phrase", async () => {
    const transcript: TranscriptSegment[] = [
      ...baseTranscript,
      { speaker: "client", start: 13, end: 17, text: "Honestly sometimes I just want to end my life.", confidence: 1 },
    ];
    const engine = new NoteEngine(new MockLlmProvider({ responders: groundedResponder() }));
    const flags: string[] = [];
    const result = await engine.generate(
      { format: "SOAP", transcript, clientLabel: "Client A" },
      { onRisk: (f) => flags.push(f.kind) },
    );
    const si = result.riskFlags.find((f) => f.kind === "suicidal_ideation");
    expect(si).toBeDefined();
    expect(si!.severity).toBe("critical");
    expect(flags).toContain("suicidal_ideation"); // streamed via hook
  });

  it("voice adaptation: personalization exemplars reach the generation prompt", async () => {
    const prompts: string[] = [];
    const engine = new NoteEngine(
      new MockLlmProvider({
        responders: {
          structured: (_s: unknown, prompt: string) => {
            prompts.push(prompt);
            return { content: "Client felt anxious about sleep.", evidence: [0] };
          },
        },
      }),
    );
    const exemplar = "Pt presents with depressed mood and constricted affect.";
    await engine.generate({ format: "SOAP", transcript: baseTranscript, clientLabel: "Client A", styleExemplars: [exemplar] });
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.every((p) => p.includes(exemplar))).toBe(true);
  });
});

// Local re-parse to assert schema validity without importing the zod object here.
function NoteSectionParse(s: NoteSection): NoteSection {
  if (typeof s.key !== "string" || typeof s.title !== "string" || typeof s.content !== "string" || !Array.isArray(s.evidence)) {
    throw new Error("invalid section shape");
  }
  return s;
}
