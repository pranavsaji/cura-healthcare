import type { NoteSection, TranscriptSegment } from "@cura/shared";

/**
 * Evidence linking is the anti-hallucination guarantee (Phase 11 acceptance):
 * every retained clinical claim must trace to ≥1 transcript span, and any claim
 * that cannot be grounded is **surfaced, not silently kept**. Two independent
 * checks run:
 *   1. Reference integrity — an `evidence` start must point at a real segment.
 *   2. Content grounding — the words of each sentence must actually appear in the
 *      transcript; a sentence invented out of whole cloth is flagged.
 * The linker is pure + deterministic (no clock/network) so it is fully testable.
 */

/** A sentence-level claim the linker could not ground in the transcript. */
export interface UnmappedClaim {
  sectionKey: string;
  /** The specific sentence (claim) that lacks support. */
  claim: string;
  reason: "no_evidence" | "unsupported_content" | "dangling_reference";
}

export interface EvidenceResult {
  /** Sections with only *valid* evidence starts retained (invalid refs dropped). */
  sections: NoteSection[];
  /** Every claim that could not be grounded — shown to the clinician for review. */
  unmapped: UnmappedClaim[];
}

/** Words too common to count as evidence of grounding. */
const STOPWORDS = new Set(
  (
    "a an the and or but if then else of to in on at for with without as by from into over under " +
    "is are was were be been being am do does did have has had will would shall should can could may " +
    "might must this that these those it its i you he she they we me him her them us my your his their our " +
    "not no yes so than too very just about more most some any each also which who whom whose what when where " +
    "how why while during client patient session reported states stated said feels felt discussed"
  ).split(/\s+/),
);

/** A sentence needs at least this many *content* words to be a "claim" worth checking. */
const MIN_CLAIM_CONTENT_WORDS = 3;
/** Fraction of a claim's content words that must appear in the transcript to pass. */
const GROUNDING_THRESHOLD = 0.5;

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Split section content into sentence-level claims. */
export function splitClaims(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Build the set of content words present anywhere in the transcript. */
function transcriptVocabulary(transcript: readonly TranscriptSegment[]): Set<string> {
  const vocab = new Set<string>();
  for (const seg of transcript) for (const w of contentWords(seg.text)) vocab.add(w);
  return vocab;
}

/**
 * Link one section's evidence + detect unmapped claims.
 * @returns the section with only valid evidence starts, plus unmapped claims.
 */
export function linkSectionEvidence(
  section: NoteSection,
  transcript: readonly TranscriptSegment[],
  vocab: Set<string> = transcriptVocabulary(transcript),
): { section: NoteSection; unmapped: UnmappedClaim[] } {
  const validStarts = new Set(transcript.map((s) => s.start));
  const unmapped: UnmappedClaim[] = [];

  // 1. Reference integrity: keep only evidence starts that hit a real segment.
  const kept: number[] = [];
  const seen = new Set<number>();
  for (const start of section.evidence) {
    if (validStarts.has(start) && !seen.has(start)) {
      kept.push(start);
      seen.add(start);
    } else if (!validStarts.has(start)) {
      unmapped.push({ sectionKey: section.key, claim: `evidence @${start}s`, reason: "dangling_reference" });
    }
  }
  const evidence = kept.sort((a, b) => a - b);

  const claims = splitClaims(section.content);
  const hasClinicalContent = claims.some((c) => contentWords(c).length >= MIN_CLAIM_CONTENT_WORDS);

  // 2a. A section with real clinical content but zero valid evidence is ungrounded.
  if (hasClinicalContent && evidence.length === 0) {
    unmapped.push({ sectionKey: section.key, claim: section.content.trim(), reason: "no_evidence" });
  }

  // 2b. Per-claim content grounding: each sentence's words must appear in the transcript.
  for (const claim of claims) {
    const words = contentWords(claim);
    if (words.length < MIN_CLAIM_CONTENT_WORDS) continue; // boilerplate / guidance echo
    const supported = words.filter((w) => vocab.has(w)).length;
    if (supported / words.length < GROUNDING_THRESHOLD) {
      unmapped.push({ sectionKey: section.key, claim, reason: "unsupported_content" });
    }
  }

  return { section: { ...section, evidence }, unmapped };
}

/** Link evidence across every section of a note. */
export function linkEvidence(
  sections: readonly NoteSection[],
  transcript: readonly TranscriptSegment[],
): EvidenceResult {
  const vocab = transcriptVocabulary(transcript);
  const out: NoteSection[] = [];
  const unmapped: UnmappedClaim[] = [];
  for (const s of sections) {
    const r = linkSectionEvidence(s, transcript, vocab);
    out.push(r.section);
    unmapped.push(...r.unmapped);
  }
  return { sections: out, unmapped };
}
