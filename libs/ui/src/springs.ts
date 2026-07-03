/* ────────────────────────────────────────────────────────────────────
   Motion vocabulary — the single source of truth for framer-motion
   spring configs and shared reveal variants. Components import from here
   instead of hard-coding stiffness/damping, so the "feel" stays uniform
   across marketing + product (mirrors the token discipline in tokens.css).
   ──────────────────────────────────────────────────────────────────── */
import type { Transition, Variants } from "framer-motion";

/** Named spring transitions. `snappy` for controls, `smooth` for surfaces,
 *  `lazy` for hero/parallax depth. */
export const springs = {
  snappy: { type: "spring", stiffness: 420, damping: 32, mass: 0.6 },
  smooth: { type: "spring", stiffness: 180, damping: 26, mass: 0.9 },
  lazy: { type: "spring", stiffness: 90, damping: 20, mass: 1.1 },
} satisfies Record<string, Transition>;

/** Blur-in + rise reveal, matching the `blur-in` keyframe already in the
 *  Tailwind preset. Use with `<MotionReveal>` or directly as variants. */
export const reveal = {
  hidden: { opacity: 0, y: 12, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: springs.smooth },
} satisfies Variants;

/** Container that staggers its children's `reveal`. */
export const staggerContainer = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Page enter/exit for route transitions. */
export const pageTransition = {
  initial: { opacity: 0, y: 8, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: springs.smooth },
  exit: { opacity: 0, y: -6, filter: "blur(6px)", transition: { duration: 0.18 } },
} satisfies Variants;
