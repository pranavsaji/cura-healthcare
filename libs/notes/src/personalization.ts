/**
 * The personalization loop. Every time a clinician edits a generated section, we
 * store a `before → after` diff (Phase 03 `note_edits`). This module aggregates
 * those diffs into per-clinician **style exemplars** that get injected into the
 * generation prompt, so the note engine learns each clinician's voice over time
 * (Phase 11 mandate). It is tenant + clinician scoped and provider-agnostic:
 * pure functions over edit records, no model dependency.
 */

/** A recorded edit (mirrors the `note_edits` row shape, minus storage ids). */
export interface NoteEdit {
  sectionKey: string;
  before: string;
  after: string;
  /** ISO timestamp; used only for recency ordering when present. */
  createdAt?: string;
}

/** Per-clinician learned voice, injected into prompts as `styleExamples`. */
export interface StyleProfile {
  clinicianId: string;
  /** Representative clinician-authored snippets (their voice). */
  exemplars: string[];
  /** How many edits informed this profile. */
  sampleSize: number;
}

export interface BuildProfileOptions {
  /** Max exemplars to inject (keeps prompts bounded). Default 5. */
  maxExemplars?: number;
  /** Ignore trivial edits below this drift (0..1). Default 0.15. */
  minDrift?: number;
  /** Seed exemplars from the template (org voice) to blend with learned ones. */
  seed?: string[];
}

const WORD_RE = /[a-z0-9']+/g;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).filter(Boolean);
}

/**
 * Drift = 1 − Jaccard(before, after) over word sets: 0 = identical, 1 = fully
 * rewritten. Measures how much a clinician changed the machine's draft — the
 * signal that a rephrase carries their voice (used to weight/measure adaptation).
 */
export function styleDrift(before: string, after: string): number {
  const a = new Set(tokens(before));
  const b = new Set(tokens(after));
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : 1 - intersection / union;
}

/** Normalize a snippet for exemplar use (collapse whitespace, trim, clip). */
function normalizeExemplar(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 400 ? clean.slice(0, 397) + "…" : clean;
}

/**
 * Aggregate a clinician's edits into a {@link StyleProfile}. We keep the `after`
 * text of edits that meaningfully changed the draft (drift ≥ `minDrift`), most
 * recent first, de-duplicated, capped at `maxExemplars`. Seed exemplars (org/
 * template voice) fill remaining slots so a brand-new clinician still gets tone.
 */
export function buildStyleProfile(
  clinicianId: string,
  edits: readonly NoteEdit[],
  opts: BuildProfileOptions = {},
): StyleProfile {
  const maxExemplars = opts.maxExemplars ?? 5;
  const minDrift = opts.minDrift ?? 0.15;

  const ranked = edits
    .map((e) => ({ edit: e, drift: styleDrift(e.before, e.after) }))
    .filter(({ edit, drift }) => drift >= minDrift && edit.after.trim().length > 0)
    // Most recent first (stable when timestamps are absent/equal).
    .sort((a, b) => (b.edit.createdAt ?? "").localeCompare(a.edit.createdAt ?? ""));

  const exemplars: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const snippet = normalizeExemplar(raw);
    const dedupeKey = snippet.toLowerCase();
    if (snippet && !seen.has(dedupeKey) && exemplars.length < maxExemplars) {
      seen.add(dedupeKey);
      exemplars.push(snippet);
    }
  };

  for (const { edit } of ranked) push(edit.after);
  for (const s of opts.seed ?? []) push(s); // backfill remaining slots with org voice

  return { clinicianId, exemplars, sampleSize: edits.length };
}
