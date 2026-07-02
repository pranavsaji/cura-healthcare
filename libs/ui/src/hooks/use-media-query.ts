import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe (returns `false` until mounted) and
 * cleans up its listener. The building block for {@link useReducedMotion} and
 * responsive layout switches.
 */
export function useMediaQuery(query: string): boolean {
  // Lazy init from the actual media state so the first render is already correct
  // (avoids a one-frame "wrong motion" flash before the effect runs). Guards
  // `window` so it stays SSR-safe (server renders `false`).
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
