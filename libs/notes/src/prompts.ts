import { type PromptRegistry, type PromptTemplate, defaultPromptRegistry } from "@cura/llm";

/**
 * Note-engine prompts, registered into the `@cura/llm` versioned registry so
 * every generation records exactly which `id@version` produced it (reproducibility
 * + audit, Phase 14). We generate **one section at a time** (see note-generator)
 * so sections can stream to the editor as they complete and each is grounded in
 * evidence independently.
 */

export interface NoteSectionVars {
  format: string;
  /** De-identified label only — minimum-necessary PHI (CONVENTIONS §6). */
  clientLabel: string;
  section: { key: string; title: string; guidance: string };
  /** The remaining section titles, for context/no-overlap. */
  otherSections: string[];
  transcript: { speaker: string; start: number; text: string }[];
  /** Clinician voice exemplars to match tone (personalization loop). */
  styleExamples?: string[];
  /** Modality hints (CBT/DBT/…) from the template. */
  modalityHints?: string[];
}

const SECTION_SYSTEM = `You are a meticulous clinical documentation assistant for licensed behavioral-health clinicians.
You write a SINGLE progress-note section that is accurate, concise, and defensible.
Rules:
- Use ONLY information present in the transcript. Never invent facts, quotes, diagnoses, or plans.
- Attribute observations to the correct speaker (clinician vs client).
- Cite the transcript: return the start-times of the exact segments you drew from in \`evidence\`.
- If nothing in the transcript supports this section, return empty content and an empty \`evidence\` array — do not fabricate.
- Match the clinician's documentation voice when style examples are provided.
- Never include client identifiers beyond the provided de-identified label.`;

export const noteSectionPrompt: PromptTemplate<NoteSectionVars> = {
  id: "note-section-gen",
  version: 1,
  description: "Generate one evidence-linked progress-note section from a session transcript.",
  system: SECTION_SYSTEM,
  render: (v) => {
    const transcript = v.transcript
      .map((t) => `[${t.start.toFixed(1)}s] ${t.speaker}: ${t.text}`)
      .join("\n");
    const style = v.styleExamples?.length
      ? `\n\nClinician voice examples (match this tone and phrasing):\n${v.styleExamples
          .map((e) => `- ${e}`)
          .join("\n")}`
      : "";
    const modality = v.modalityHints?.length
      ? `\n\nTherapeutic modalities in use: ${v.modalityHints.join(", ")}.`
      : "";
    const others = v.otherSections.length
      ? `\n\nOther sections of this ${v.format} note (do not duplicate their content): ${v.otherSections.join(", ")}.`
      : "";
    return `Write the "${v.section.title}" section of a ${v.format} progress note for client ${v.clientLabel}.

Section guidance: ${v.section.guidance}${others}${modality}

Return the written \`content\` for this section and an \`evidence\` array of transcript start-times (seconds) you used.${style}

Transcript:
${transcript}`;
  },
};

/**
 * Register the note-engine prompts onto an existing registry (idempotent per
 * `id@version` — re-registering the same version throws by design).
 */
export function registerNotePrompts(registry: PromptRegistry): PromptRegistry {
  registry.register(noteSectionPrompt);
  return registry;
}

/**
 * A registry pre-loaded with the platform's shipped LLM prompts *plus* the
 * note-engine prompts. Fresh instance per call (no shared mutable global).
 */
export function noteEngineRegistry(): PromptRegistry {
  return registerNotePrompts(defaultPromptRegistry());
}
