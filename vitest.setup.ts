import { expect } from "vitest";
// jest-axe provides the `toHaveNoViolations` matcher for a11y assertions.
import { toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

/**
 * jsdom doesn't implement `matchMedia` or `IntersectionObserver`. Provide inert
 * defaults so browser components render in tests; individual specs override
 * `window.matchMedia` to simulate `prefers-reduced-motion`.
 */
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!("IntersectionObserver" in window)) {
    class IO {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  }
}
