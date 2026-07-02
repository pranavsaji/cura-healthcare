/**
 * Domain vocabulary for keyword boosting. Behavioral-health and general medical
 * terms are frequently misrecognized by generic ASR models; feeding them to the
 * provider as boosted keywords materially improves accuracy on clinical audio.
 * The lists are provider-agnostic — {@link toKeywordBoosts} renders them into the
 * format a given backend expects (e.g. Deepgram's `term:boost`).
 */

/** Behavioral-health terminology (modalities, symptoms, risk, meds). */
export const BEHAVIORAL_HEALTH_TERMS = [
  // Modalities & techniques
  "CBT",
  "DBT",
  "EMDR",
  "psychoeducation",
  "grounding",
  "mindfulness",
  "cognitive reframing",
  "exposure therapy",
  "motivational interviewing",
  // Symptoms & presentation
  "anhedonia",
  "dysregulation",
  "hypervigilance",
  "rumination",
  "dissociation",
  "flashback",
  "panic attack",
  "intrusive thoughts",
  "affect",
  "flat affect",
  "labile",
  // Diagnoses
  "PTSD",
  "GAD",
  "MDD",
  "OCD",
  "ADHD",
  "bipolar",
  "borderline",
  // Risk
  "suicidal ideation",
  "self-harm",
  "homicidal ideation",
  "safety plan",
  "mandated reporting",
  // Meds
  "sertraline",
  "fluoxetine",
  "escitalopram",
  "bupropion",
  "lamotrigine",
  "quetiapine",
  "naltrexone",
] as const;

/** General clinical terms useful across verticals. */
export const MEDICAL_TERMS = [
  "PRN",
  "titration",
  "contraindication",
  "comorbidity",
  "prognosis",
  "referral",
  "follow-up",
  "informed consent",
] as const;

/** The default boost list = BH + general medical, de-duplicated. */
export const DEFAULT_VOCABULARY: string[] = dedupe([
  ...BEHAVIORAL_HEALTH_TERMS,
  ...MEDICAL_TERMS,
]);

/**
 * Merge caller-supplied terms with the built-in defaults (case-insensitive
 * de-dupe, original casing preserved). Empty/whitespace terms are dropped.
 */
export function buildVocabulary(extra: readonly string[] = []): string[] {
  return dedupe([...DEFAULT_VOCABULARY, ...extra].map((t) => t.trim()).filter(Boolean));
}

/** A single boosted keyword: the term and its intensity (0..10-ish, provider-specific). */
export interface KeywordBoost {
  term: string;
  boost: number;
}

/**
 * Render terms into keyword boosts. Multi-word phrases get a slightly higher
 * boost (they're rarer and more diagnostic). Used by the Deepgram provider.
 */
export function toKeywordBoosts(terms: readonly string[], baseBoost = 2): KeywordBoost[] {
  return dedupe(terms.map((t) => t.trim()).filter(Boolean)).map((term) => ({
    term,
    boost: term.includes(" ") ? baseBoost + 1 : baseBoost,
  }));
}

/** Deepgram encodes keywords as `keywords=term:boost` query params. */
export function toDeepgramKeywords(terms: readonly string[], baseBoost = 2): string[] {
  return toKeywordBoosts(terms, baseBoost).map((k) => `${k.term}:${k.boost}`);
}

function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
