/**
 * Minimal X12 EDI segment plumbing shared by the 837/835 codecs. Real X12 has
 * many envelopes; we implement the delimiters + envelope integrity that matter
 * for building valid claims and round-tripping them (Phase 18 acceptance).
 */
export const X12 = {
  element: "*",
  segment: "~",
  subElement: ":",
  repetition: "^",
} as const;

/** Build a segment line from a tag + elements (trailing empties trimmed). */
export function seg(tag: string, ...elements: (string | number)[]): string {
  const parts = elements.map((e) => String(e));
  // Trim trailing empty elements for cleanliness (they're implied).
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return [tag, ...parts].join(X12.element);
}

/** Dollars string from integer cents (X12 monetary), e.g. 12500 → "125.00". */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Integer cents from an X12 monetary amount, e.g. "125.00" → 12500. */
export function amountToCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

/** Join segments into a full interchange with segment terminators. */
export function assemble(segments: string[]): string {
  return segments.map((s) => s + X12.segment).join("");
}

/** Parse an interchange into an array of element arrays keyed by segment tag. */
export interface ParsedSegment {
  tag: string;
  elements: string[];
}

export function parseSegments(edi: string): ParsedSegment[] {
  return edi
    .split(X12.segment)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const [tag, ...elements] = s.split(X12.element);
      return { tag: tag ?? "", elements };
    });
}

/** Normalize a date to X12 D8 form (YYYYMMDD). */
export function d8(date: string): string {
  return date.replace(/-/g, "").slice(0, 8);
}
