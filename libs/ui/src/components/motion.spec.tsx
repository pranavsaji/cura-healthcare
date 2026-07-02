/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FlowLine } from "./flow-line.js";
import { Marquee } from "./marquee.js";

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FlowLine reduced-motion behavior", () => {
  it("runs a rAF loop when motion is allowed", () => {
    setReducedMotion(false);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1 as unknown as number);
    render(<FlowLine />);
    expect(screen.getByTestId("flow-line").getAttribute("data-reduced-motion")).toBe("false");
    expect(raf).toHaveBeenCalled();
  });

  it("renders a static frame (no rAF) under reduced motion", () => {
    setReducedMotion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<FlowLine />);
    expect(screen.getByTestId("flow-line").getAttribute("data-reduced-motion")).toBe("true");
    expect(raf).not.toHaveBeenCalled();
  });
});

describe("Marquee reduced-motion behavior", () => {
  it("animates when motion is allowed", () => {
    setReducedMotion(false);
    render(
      <Marquee>
        <span>logo</span>
      </Marquee>,
    );
    const track = screen.getByTestId("marquee").firstElementChild!;
    expect(track.getAttribute("data-animated")).toBe("true");
    expect(track.className).toContain("animate-marquee");
  });

  it("does not translate under reduced motion", () => {
    setReducedMotion(true);
    render(
      <Marquee>
        <span>logo</span>
      </Marquee>,
    );
    const track = screen.getByTestId("marquee").firstElementChild!;
    expect(track.getAttribute("data-animated")).toBe("false");
    expect(track.className).not.toContain("animate-marquee");
  });
});
