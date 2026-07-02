import type { LlmProvider } from "@cura/llm";
import type { NoteFormat, NoteSection, NoteTemplate, RiskFlag, TranscriptSegment } from "@cura/shared";
import type { UnmappedClaim } from "./evidence.js";
import { NoteGenerator } from "./note-generator.js";
import { RiskScanner } from "./risk.js";
import { type ResolvedTemplate, resolveFormat, resolveTemplate } from "./template-engine.js";

export * from "./template-engine.js";
export * from "./note-generator.js";
export * from "./evidence.js";
export * from "./risk.js";
export * from "./personalization.js";
export * from "./prompts.js";

/**
 * `NoteEngine` is the one façade apps/worker use (CONVENTIONS §8: capability
 * lives in libs, apps stay thin). It composes the four concerns — template
 * resolution, streamed structured generation, evidence linking, and risk
 * flagging — into a single streamable call. Provider-agnostic: inject any
 * {@link LlmProvider} (mock for dev/tests, gateway in prod).
 */

export interface NoteEngineInput {
  /** A stored template, OR a bare format resolved to its built-in sections. */
  template?: NoteTemplate;
  format?: NoteFormat;
  transcript: TranscriptSegment[];
  clientLabel: string;
  /** Learned clinician voice (from personalization) to match. */
  styleExemplars?: string[];
  /** Run the LLM risk-verification pass in addition to the rule floor. */
  verifyRisk?: boolean;
}

export interface NoteEngineResult {
  format: NoteFormat;
  templateId: string;
  sections: NoteSection[];
  riskFlags: RiskFlag[];
  /** Claims that could not be grounded in the transcript (review, don't ship). */
  unmapped: UnmappedClaim[];
  model: string;
  promptVersion: string;
}

export interface NoteEngineHooks {
  onSection?: (section: NoteSection) => void;
  onRisk?: (flag: RiskFlag) => void;
}

export class NoteEngine {
  private readonly generator: NoteGenerator;
  private readonly risk: RiskScanner;

  constructor(private readonly llm: LlmProvider) {
    this.generator = new NoteGenerator(llm);
    this.risk = new RiskScanner(llm);
  }

  private resolve(input: NoteEngineInput): ResolvedTemplate {
    if (input.template) return resolveTemplate(input.template);
    if (input.format) return resolveFormat(input.format);
    throw new Error("NoteEngine.generate requires a template or a format");
  }

  async generate(input: NoteEngineInput, hooks: NoteEngineHooks = {}): Promise<NoteEngineResult> {
    const template = this.resolve(input);

    // Risk scan first: safety is surfaced before/independently of the note draft.
    const riskFlags = await this.risk.scan(input.transcript, { verify: input.verifyRisk ?? false });
    for (const f of riskFlags) hooks.onRisk?.(f);

    const generated = await this.generator.generate(
      {
        template,
        transcript: input.transcript,
        clientLabel: input.clientLabel,
        ...(input.styleExemplars ? { styleExemplars: input.styleExemplars } : {}),
      },
      { ...(hooks.onSection ? { onSection: hooks.onSection } : {}) },
    );

    return {
      format: template.format,
      templateId: template.id,
      sections: generated.sections,
      riskFlags,
      unmapped: generated.unmapped,
      model: generated.model,
      promptVersion: generated.promptVersion,
    };
  }
}
