/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Tilt, Magnetic, Parallax, PageTransition, MotionReveal, CountUp } from "./motion.js";

/** Force `prefers-reduced-motion` to a given value for a test. */
function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

describe("motion primitives — reduced-motion mandate", () => {
  it("Tilt renders a plain, non-transformed wrapper under reduced motion", () => {
    setReducedMotion(true);
    render(
      <Tilt>
        <span>tiltable</span>
      </Tilt>,
    );
    const el = screen.getByText("tiltable").parentElement!;
    // No perspective / preserve-3d styling when reduced.
    expect(el.getAttribute("style")).toBeNull();
    expect(el.className).not.toContain("preserve-3d");
  });

  it("Magnetic, Parallax, MotionReveal all still render their children", () => {
    setReducedMotion(true);
    render(
      <>
        <Magnetic>
          <span>mag</span>
        </Magnetic>
        <Parallax>
          <span>par</span>
        </Parallax>
        <MotionReveal>
          <span>rev</span>
        </MotionReveal>
      </>,
    );
    expect(screen.getByText("mag")).toBeTruthy();
    expect(screen.getByText("par")).toBeTruthy();
    expect(screen.getByText("rev")).toBeTruthy();
  });

  it("PageTransition renders children immediately under reduced motion", () => {
    setReducedMotion(true);
    render(
      <PageTransition id="/x">
        <span>page</span>
      </PageTransition>,
    );
    expect(screen.getByText("page")).toBeTruthy();
  });

  it("CountUp shows the final formatted value immediately when reduced", () => {
    setReducedMotion(true);
    render(<CountUp value={42} format={(n) => `${Math.round(n)}%`} />);
    expect(screen.getByText("42%")).toBeTruthy();
  });
});
