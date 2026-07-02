import { z } from "zod";
import type { LlmProvider } from "@cura/llm";
import type { NoteSection, TranscriptSegment } from "@cura/shared";
import { type UnmappedClaim, linkSectionEvidence } from "./evidence.js";
import { noteSectionPrompt } from "./prompts.js";
import type { ResolvedTemplate } from "./template-engine.js";

/**
 * The note generator: a pure pipeline `(template, transcript, style) →
 * NoteSection[]` behind one interface, **streamable** and reused by web + worker
 * (Phase 11 mandate). It generates one section at a time via
 * `llm.generateStructured` so (a) output is always schema-valid, (b) each section
 * is grounded independently, and (c) sections stream to the editor as produced.
 */

/** The per-section structured output the model must return. Schema-enforced. */
export const SectionGenSchema = z.object({
  content: z.string(),
  /** Transcript segment start-times (seconds) the content draws from. */
  evidence: z.array(z.number()).default([]),
});
export type SectionGen = z.infer<typeof SectionGenSchema>;

export interface GenerateNoteInput {
  template: ResolvedTemplate;
  transcript: TranscriptSegment[];
  /** De-identified label only — minimum-necessary PHI. */
  clientLabel: string;
  /** Learned clinician voice (from personalization) merged over template seeds. */
  styleExemplars?: string[];
}

export interface GeneratedNote {
  sections: NoteSection[];
  /** Claims the evidence linker could not ground (surfaced to the clinician). */
  unmapped: UnmappedClaim[];
  model: string;
  promptVersion: string;
}

export interface GenerateHooks {
  /** Called with each section as soon as it's generated + evidence-linked. */
  onSection?: (section: NoteSection) => void;
}

export class NoteGenerator {
  constructor(private readonly llm: LlmProvider) {}

  async generate(input: GenerateNoteInput, hooks: GenerateHooks = {}): Promise<GeneratedNote> {
    const { template, transcript, clientLabel } = input;
    const styleExamples = input.styleExemplars?.length
      ? input.styleExemplars
      : template.styleExamples;
    const promptVersion = `${noteSectionPrompt.id}@${noteSectionPrompt.version}`;

    const sections: NoteSection[] = [];
    const unmapped: UnmappedClaim[] = [];

    for (const spec of template.sections) {
      const prompt = noteSectionPrompt.render({
        format: template.format,
        clientLabel,
        section: { key: spec.key, title: spec.title, guidance: spec.guidance },
        otherSections: template.sections.filter((s) => s.key !== spec.key).map((s) => s.title),
        transcript: transcript.map((t) => ({ speaker: t.speaker, start: t.start, text: t.text })),
        ...(styleExamples.length ? { styleExamples } : {}),
        ...(template.modalityHints.length ? { modalityHints: template.modalityHints } : {}),
      });

      const { value } = await this.llm.generateStructured(SectionGenSchema, prompt, {
        ...(noteSectionPrompt.system ? { system: noteSectionPrompt.system } : {}),
        promptVersion,
        temperature: 0,
      });

      const raw: NoteSection = {
        key: spec.key,
        title: spec.title,
        content: value.content,
        evidence: value.evidence ?? [],
      };
      // Evidence pass per section → clean, grounded section streamed immediately.
      const linked = linkSectionEvidence(raw, transcript);
      sections.push(linked.section);
      unmapped.push(...linked.unmapped);
      hooks.onSection?.(linked.section);
    }

    return { sections, unmapped, model: this.llm.model, promptVersion };
  }
}
