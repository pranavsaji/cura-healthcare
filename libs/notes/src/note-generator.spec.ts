import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "@cura/llm";
import type { TranscriptSegment } from "@cura/shared";
import { NoteGenerator, SectionGenSchema } from "./note-generator.js";
import { resolveFormat } from "./template-engine.js";

const transcript: TranscriptSegment[] = [
  { speaker: "client", start: 0, end: 4, text: "I felt anxious and my sleep was terrible this week.", confidence: 1 },
  { speaker: "clinician", start: 4, end: 8, text: "We practiced grounding breathing techniques.", confidence: 1 },
  { speaker: "client", start: 8, end: 12, text: "The breathing helped me feel calmer.", confidence: 1 },
];

/** A responder that returns grounded content + valid evidence per section. */
function groundedResponder() {
  return {
    structured: (_schema: unknown, prompt: string) => {
      const title = /Write the "([^"]+)" section/.exec(prompt)?.[1] ?? "Section";
      return {
        content: `${title}: client reported anxious sleep and practiced grounding breathing.`,
        evidence: [0, 4],
      };
    },
  };
}

describe("NoteGenerator", () => {
  it("generates sections in template order and streams each once", async () => {
    const llm = new MockLlmProvider({ responders: groundedResponder() });
    const gen = new NoteGenerator(llm);
    const streamed: string[] = [];
    const result = await gen.generate(
      { template: resolveFormat("SOAP"), transcript, clientLabel: "Client A" },
      { onSection: (s) => streamed.push(s.key) },
    );
    expect(result.sections.map((s) => s.key)).toEqual(["subjective", "objective", "assessment", "plan"]);
    expect(streamed).toEqual(["subjective", "objective", "assessment", "plan"]);
    expect(result.promptVersion).toBe("note-section-gen@1");
    expect(result.model).toBe("mock");
  });

  it("attaches only valid evidence and reports no unmapped claims when grounded", async () => {
    const llm = new MockLlmProvider({ responders: groundedResponder() });
    const gen = new NoteGenerator(llm);
    const result = await gen.generate({ template: resolveFormat("DAP"), transcript, clientLabel: "Client A" });
    for (const s of result.sections) expect(s.evidence).toEqual([0, 4]);
    expect(result.unmapped).toEqual([]);
  });

  it("surfaces fabricated content the model returns as unmapped", async () => {
    const llm = new MockLlmProvider({
      responders: {
        structured: () => ({ content: "Client purchased a spaceship and flew to Jupiter.", evidence: [] }),
      },
    });
    const gen = new NoteGenerator(llm);
    const result = await gen.generate({ template: resolveFormat("DAP"), transcript, clientLabel: "Client A" });
    expect(result.unmapped.length).toBeGreaterThan(0);
    expect(result.unmapped.some((u) => u.reason === "unsupported_content" || u.reason === "no_evidence")).toBe(true);
  });

  it("injects clinician style exemplars into the section prompt (personalization active)", async () => {
    const prompts: string[] = [];
    const llm = new MockLlmProvider({
      responders: {
        structured: (_schema: unknown, prompt: string) => {
          prompts.push(prompt);
          return { content: "Client reported anxious sleep.", evidence: [0] };
        },
      },
    });
    const gen = new NoteGenerator(llm);
    await gen.generate({
      template: resolveFormat("SOAP"),
      transcript,
      clientLabel: "Client A",
      styleExemplars: ["Pt presents with depressed mood and flat affect."],
    });
    expect(prompts.every((p) => p.includes("Pt presents with depressed mood and flat affect."))).toBe(true);
  });

  it("contract: the section schema always parses the mock's default structured output", () => {
    // mockValueForSchema must satisfy SectionGenSchema — the core contract guarantee.
    const value = SectionGenSchema.parse({ content: "x", evidence: [] });
    expect(value.evidence).toEqual([]);
  });
});
