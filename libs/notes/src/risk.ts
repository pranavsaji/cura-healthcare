import { z } from "zod";
import { type LlmProvider, riskScanPrompt } from "@cura/llm";
import { RISK_KINDS, RiskFlag, type TranscriptSegment } from "@cura/shared";

/**
 * Safety/risk flagging. Two layers, in the order that matters for safety:
 *   1. **Rules** (ported from the demo) — high recall, deterministic, offline.
 *      A safety indicator is NEVER dropped by the machine.
 *   2. **LLM verification** — high precision, *additive*. It confirms rule hits
 *      and surfaces indicators the rules missed. It may never silently remove a
 *      rule hit (in BH documentation we err toward surfacing).
 * Flags are advisory only: the clinician reviews and acts — the engine never
 * auto-acts on a risk flag (Phase 11 mandate).
 */

type RuleKind = (typeof RISK_KINDS)[number];

interface RiskRule {
  re: RegExp;
  kind: RuleKind;
  severity: RiskFlag["severity"];
}

/** Ordered detection rules. Word-boundary anchored to limit false positives. */
export const RISK_RULES: readonly RiskRule[] = [
  { re: /\b(kill myself|end my life|suicid\w*|take my (own )?life|don'?t want to (be here|live|wake up))\b/i, kind: "suicidal_ideation", severity: "critical" },
  { re: /\b(hurt|kill|harm|attack) (him|her|them|someone|people)\b/i, kind: "homicidal_ideation", severity: "critical" },
  { re: /\b(abus\w*|hit me|beats? me|molest\w*|assault\w*)\b/i, kind: "abuse", severity: "warning" },
  { re: /\b(hurt (the|my) (kid|child|baby)|neglect\w* (the|my) (kid|child)|elder abuse)\b/i, kind: "mandated_reporting", severity: "warning" },
];

/** Result schema for the LLM verification pass (structured, schema-valid). */
export const RiskScanResult = z.object({ flags: z.array(RiskFlag) });
export type RiskScanResult = z.infer<typeof RiskScanResult>;

/** Rule-based scan. Pure + deterministic — the safety floor. */
export function scanRiskRules(transcript: readonly TranscriptSegment[]): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const seg of transcript) {
    for (const rule of RISK_RULES) {
      if (rule.re.test(seg.text)) {
        flags.push({ kind: rule.kind, severity: rule.severity, quote: seg.text.trim(), segmentStart: seg.start });
      }
    }
  }
  return flags;
}

/** Stable identity of a flag for de-duplication across rule + LLM layers. */
function flagKey(f: RiskFlag): string {
  return `${f.kind}@${f.segmentStart ?? "?"}`;
}

/** Merge, preferring the highest severity when two layers hit the same span. */
const SEVERITY_RANK: Record<RiskFlag["severity"], number> = { info: 0, warning: 1, critical: 2 };
export function mergeFlags(...groups: RiskFlag[][]): RiskFlag[] {
  const byKey = new Map<string, RiskFlag>();
  for (const group of groups) {
    for (const f of group) {
      const key = flagKey(f);
      const existing = byKey.get(key);
      if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
        byKey.set(key, f);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => (a.segmentStart ?? 0) - (b.segmentStart ?? 0));
}

export interface RiskScanOptions {
  /** Run the LLM verification/augmentation pass (needs a provider). Default off. */
  verify?: boolean;
}

/**
 * The scanner: rules always run; the LLM pass augments when `verify` is set.
 * Injecting the {@link LlmProvider} keeps it provider-agnostic and lets tests
 * use the deterministic mock (CONVENTIONS §2/§5).
 */
export class RiskScanner {
  constructor(
    private readonly llm: LlmProvider,
    private readonly promptVersion = `${riskScanPrompt.id}@${riskScanPrompt.version}`,
  ) {}

  async scan(transcript: readonly TranscriptSegment[], opts: RiskScanOptions = {}): Promise<RiskFlag[]> {
    const ruleHits = scanRiskRules(transcript);
    if (!opts.verify || transcript.length === 0) return ruleHits;

    const prompt = riskScanPrompt.render({
      transcript: transcript.map((t) => ({ start: t.start, speaker: t.speaker, text: t.text })),
    });
    const { value } = await this.llm.generateStructured(RiskScanResult, prompt, {
      ...(riskScanPrompt.system ? { system: riskScanPrompt.system } : {}),
      promptVersion: this.promptVersion,
      temperature: 0,
    });
    // Additive merge: rule hits are never removed; LLM findings enrich/augment.
    return mergeFlags(ruleHits, value.flags);
  }
}
