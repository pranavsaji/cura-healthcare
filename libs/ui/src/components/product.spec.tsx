/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import type { NoteSection, RiskFlag, TranscriptSegment } from "@cura/shared";
import { NoteSectionCard } from "./note-section-card.js";
import { RiskFlagCard } from "./risk-flag-card.js";
import { TranscriptLine } from "./transcript-line.js";
import { RecordButton } from "./record-button.js";

afterEach(cleanup);

const section: NoteSection = {
  key: "subjective",
  title: "Subjective",
  content: "Client reports improved sleep.",
  evidence: [0, 12],
};

describe("NoteSectionCard", () => {
  it("renders title, content, and evidence count", () => {
    render(<NoteSectionCard section={section} />);
    expect(screen.getByRole("region", { name: "Subjective" })).toBeTruthy();
    expect(screen.getByText("Client reports improved sleep.")).toBeTruthy();
    expect(screen.getByText("2 sources")).toBeTruthy();
  });

  it("marks aria-busy while streaming and passes axe", async () => {
    const { container } = render(<NoteSectionCard section={section} streaming />);
    expect(screen.getByRole("region", { name: "Subjective" }).getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("RiskFlagCard", () => {
  const flag: RiskFlag = {
    kind: "suicidal_ideation",
    severity: "critical",
    quote: "I don't want to be here anymore",
    segmentStart: 42,
  };

  it("announces urgent flags via role=alert", () => {
    render(<RiskFlagCard flag={flag} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Suicidal ideation/)).toBeTruthy();
  });

  it("does not use alert for info-level flags", () => {
    render(<RiskFlagCard flag={{ ...flag, severity: "info", kind: "abuse" }} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("TranscriptLine", () => {
  const seg: TranscriptSegment = {
    speaker: "clinician",
    start: 65,
    end: 70,
    text: "How was your week?",
    confidence: 0.95,
  };

  it("shows speaker, timestamp, and text", () => {
    render(<TranscriptLine segment={seg} />);
    expect(screen.getByText("1:05")).toBeTruthy();
    expect(screen.getByText("Clinician:")).toBeTruthy();
    expect(screen.getByText("How was your week?")).toBeTruthy();
  });

  it("flags low-confidence segments", () => {
    render(<TranscriptLine segment={{ ...seg, confidence: 0.3 }} />);
    expect(screen.getByText("(unclear)")).toBeTruthy();
  });
});

describe("RecordButton", () => {
  it("toggles and exposes aria-pressed", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RecordButton recording={false} onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: "Start recording" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<RecordButton recording onToggle={onToggle} />);
    expect(
      screen.getByRole("button", { name: "Stop recording" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("has no axe violations", async () => {
    const { container } = render(<RecordButton recording={false} onToggle={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
