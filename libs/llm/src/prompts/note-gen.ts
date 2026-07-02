import type { PromptTemplate } from "../registry.js";

/**
 * Variables for the note-generation prompt. Kept transport-agnostic: the caller
 * (Phase 11 note engine) passes the chosen template's section spec + the
 * transcript, and the model returns section content matching that schema.
 */
export interface NoteGenVars {
  format: string; // e.g. "SOAP"
  clientLabel: string; // de-identified label only — minimum-necessary PHI
  sections: { key: string; title: string; guidance: string }[];
  transcript: { speaker: string; start: number; text: string }[];
  /** Optional clinician voice exemplars to match tone/style. */
  styleExamples?: string[];
}

const SYSTEM = `You are a meticulous clinical documentation assistant for licensed behavioral-health clinicians.
You write progress notes that are accurate, concise, and defensible.
Rules:
- Use ONLY information present in the transcript. Never invent facts, quotes, diagnoses, or plans.
- Attribute observations to the correct speaker (clinician vs client).
- For each section, cite the transcript by returning the start-times of the segments you drew from.
- Match the clinician's documentation voice when style examples are provided.
- Do not include client identifiers beyond the provided de-identified label.
- If a section has no supporting evidence, state that succinctly rather than fabricating.`;

export const noteGenPrompt: PromptTemplate<NoteGenVars> = {
  id: "note-gen",
  version: 1,
  description: "Generate an evidence-linked progress note in the given format from a session transcript.",
  system: SYSTEM,
  render: (v) => {
    const sections = v.sections
      .map((s, i) => `${i + 1}. ${s.title} (key: "${s.key}") — ${s.guidance}`)
      .join("\n");
    const transcript = v.transcript
      .map((t) => `[${t.start.toFixed(1)}s] ${t.speaker}: ${t.text}`)
      .join("\n");
    const style = v.styleExamples?.length
      ? `\n\nClinician voice examples (match this tone):\n${v.styleExamples.map((e) => `- ${e}`).join("\n")}`
      : "";
    return `Write a ${v.format} progress note for client ${v.clientLabel}.

Produce exactly these sections, in order:
${sections}

For each section return: the section key, the title, the written content, and an \`evidence\` array of transcript start-times (seconds) you used.${style}

Transcript:
${transcript}`;
  },
};
