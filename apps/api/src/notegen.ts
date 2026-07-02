import { createLlm, type LlmProvider } from "@cura/llm";
import { NoteEngine } from "@cura/notes";
import type { Note, RiskFlag } from "@cura/shared";
import { env } from "./env.js";
import type { Store } from "./store/index.js";

/**
 * Real note generation (Phase 11): structured, evidence-linked, risk-flagged
 * generation via `@cura/notes` on top of the `@cura/llm` gateway — no more demo
 * heuristics. The provider is selected by env (`LLM_PROVIDER`); with no key it
 * transparently degrades to the deterministic mock so dev/CI never break and no
 * PHI reaches Anthropic before a BAA (CONVENTIONS §2/§6).
 */

/** The LLM verification pass only runs on a real provider (the mock would
 * synthesize spurious risk flags from its schema — never enable it for mock). */
const realProvider = env.llmProvider === "anthropic" && env.anthropicApiKey.length > 0;

let engineSingleton: NoteEngine | undefined;
function engine(): NoteEngine {
  if (!engineSingleton) {
    const llm: LlmProvider = createLlm({
      provider: env.llmProvider,
      apiKey: env.anthropicApiKey || undefined,
      model: env.llmModel,
    });
    engineSingleton = new NoteEngine(llm);
  }
  return engineSingleton;
}

/** Test seam: override the engine (e.g. inject a scripted mock provider). */
export function __setNoteEngine(e: NoteEngine | undefined): void {
  engineSingleton = e;
}

/**
 * Generate a structured, evidence-linked note for a session and persist it via
 * the store (which owns id + timestamps). `onSection` streams each section out
 * over the WS as it's produced; `onRisk` streams safety flags as they're found.
 */
export async function generateNoteForSession(
  store: Store,
  sessionId: string,
  hooks?: {
    onSection?: (section: Note["sections"][number]) => void;
    onRisk?: (flag: RiskFlag) => void;
  },
): Promise<Note> {
  const session = await store.getSession(sessionId);
  if (!session) throw new Error("session not found");
  const template = await store.templateForSession(sessionId);
  const transcript = await store.getTranscript(sessionId);

  const result = await engine().generate(
    {
      template,
      transcript,
      clientLabel: session.clientLabel,
      verifyRisk: realProvider,
    },
    {
      ...(hooks?.onSection ? { onSection: hooks.onSection } : {}),
      ...(hooks?.onRisk ? { onRisk: hooks.onRisk } : {}),
    },
  );

  const note = await store.createNote({
    sessionId,
    templateId: template.id,
    format: result.format,
    sections: result.sections,
    riskFlags: result.riskFlags,
    status: "draft",
    model: result.model,
    promptVersion: result.promptVersion,
  });
  await store.updateSession(sessionId, { status: "noted" });
  return note;
}
