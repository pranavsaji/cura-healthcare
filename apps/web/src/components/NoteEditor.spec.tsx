// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NoteSection, RiskFlag, TranscriptSegment } from "@cura/shared";
import { NoteEditor } from "./NoteEditor.js";

const sync = vi.fn(async () => ({ formatted: "SOAP NOTE\n...", note: {} }));
const sign = vi.fn(async () => ({}));
vi.mock("../api.js", () => ({
  api: {
    sync: (...a: unknown[]) => sync(...(a as [])),
    sign: (...a: unknown[]) => sign(...(a as [])),
    editSection: vi.fn(async () => ({})),
  },
}));

const sections: NoteSection[] = [
  { key: "subjective", title: "Subjective", content: "Client reported anxiety and poor sleep.", evidence: [0] },
];
const transcript: TranscriptSegment[] = [
  { speaker: "client", start: 0, end: 4, text: "I have been anxious and not sleeping.", confidence: 1 },
];
const risks: RiskFlag[] = [{ kind: "suicidal_ideation", severity: "critical", quote: "end my life", segmentStart: 12 }];

afterEach(cleanup);

describe("NoteEditor", () => {
  it("renders a risk banner when a flag is present", () => {
    render(<NoteEditor phase="ready" noteId="n1" format="SOAP" sections={sections} risks={risks} transcript={transcript} />);
    expect(screen.getByText(/risk flag/i)).toBeTruthy();
    expect(screen.getByText(/Suicidal ideation/i)).toBeTruthy();
  });

  it("opens an evidence popover showing the supporting transcript span", () => {
    render(<NoteEditor phase="ready" noteId="n1" format="SOAP" sections={sections} risks={[]} transcript={transcript} />);
    fireEvent.click(screen.getByRole("button", { name: /Show 1 evidence link for Subjective/i }));
    const dialog = screen.getByRole("dialog", { name: /Evidence for Subjective/i });
    expect(dialog.textContent).toContain("anxious and not sleeping");
  });

  it("Super Fill syncs and copies formatted text to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<NoteEditor phase="ready" noteId="n1" format="SOAP" sections={sections} risks={[]} transcript={transcript} />);
    fireEvent.click(screen.getByRole("button", { name: /Super Fill/i }));
    await waitFor(() => expect(sync).toHaveBeenCalled());
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("SOAP NOTE\n..."));
  });

  it("signs the note", async () => {
    render(<NoteEditor phase="ready" noteId="n1" format="SOAP" sections={sections} risks={[]} transcript={transcript} />);
    fireEvent.click(screen.getByRole("button", { name: /Sign note/i }));
    await waitFor(() => expect(sign).toHaveBeenCalled());
  });
});
