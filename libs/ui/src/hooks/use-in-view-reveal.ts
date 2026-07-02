import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion.js";

export interface InViewRevealOptions {
  /** Fraction of the element visible before it counts as revealed. */
  threshold?: number;
  /** Reveal only once, then stop observing (default true). */
  once?: boolean;
}

/**
 * Reveal-on-scroll primitive powering blur-in section transitions. Returns a
 * ref to attach and an `inView` flag. Respects reduced-motion by revealing
 * immediately (no observer, no animation).
 */
export function useInViewReveal<T extends Element = HTMLDivElement>(
  options: InViewRevealOptions = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  const { threshold = 0.2, once = true } = options;
  const ref = useRef<T | null>(null);
  const reducedMotion = useReducedMotion();
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once, reducedMotion]);

  return { ref, inView };
}
