import { useMediaQuery } from "./use-media-query.js";

/**
 * True when the user prefers reduced motion. Every animated component consults
 * this and renders a static frame instead of running rAF loops / transitions
 * (CONVENTIONS + Phase 02 a11y mandate).
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
