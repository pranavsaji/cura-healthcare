/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useMediaQuery } from "./use-media-query.js";
import { useReducedMotion } from "./use-reduced-motion.js";
import { useInViewReveal } from "./use-in-view-reveal.js";

afterEach(cleanup);

function setMatch(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function Probe({ hook }: { hook: () => boolean }) {
  return <span data-testid="v">{String(hook())}</span>;
}

describe("useMediaQuery / useReducedMotion", () => {
  it("reflects a matching query", () => {
    setMatch(true);
    render(<Probe hook={() => useMediaQuery("(min-width: 100px)")} />);
    expect(screen.getByTestId("v").textContent).toBe("true");
  });

  it("reports reduced motion when the media query matches", () => {
    setMatch(true);
    render(<Probe hook={useReducedMotion} />);
    expect(screen.getByTestId("v").textContent).toBe("true");
  });
});

describe("useInViewReveal", () => {
  it("reveals immediately under reduced motion", () => {
    setMatch(true); // reduce motion → reveal without observer
    function C() {
      const { ref, inView } = useInViewReveal<HTMLDivElement>();
      return (
        <div ref={ref} data-testid="reveal">
          {String(inView)}
        </div>
      );
    }
    render(<C />);
    expect(screen.getByTestId("reveal").textContent).toBe("true");
  });
});
