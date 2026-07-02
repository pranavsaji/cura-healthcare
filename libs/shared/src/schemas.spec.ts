import { describe, it, expect } from "vitest";
import { NoteFormat, sectionsForFormat, DEFAULT_SECTIONS } from "./templates.js";
import { Session, CreateSessionInput } from "./sessions.js";
import { Note, TranscriptSegment, renderNoteText, type NoteSection } from "./notes.js";
import { ServerMessage, ClientMessage } from "./realtime.js";

// Inline fixtures — libs/shared is L0 and must not import other packages
// (not even @cura/testing), which would create a cycle.
const section: NoteSection = {
  key: "subjective",
  title: "Subjective",
  content: "Client reports increased anxiety.",
  evidence: [0],
};
const session = {
  id: "sess_1",
  orgId: "org_1",
  clinicianId: "user_1",
  clientId: null,
  clientLabel: "S. M · 32F",
  modality: "CBT",
  source: "live",
  status: "created",
  consentAt: null,
  startedAt: null,
  endedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const note = {
  id: "note_1",
  orgId: "org_1",
  sessionId: "sess_1",
  templateId: "tmpl_soap",
  format: "SOAP",
  sections: [section],
  riskFlags: [],
  status: "draft",
  model: "mock",
  promptVersion: "notegen-v1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("templates", () => {
  it("every non-custom format has default sections with ordered keys", () => {
    for (const format of NoteFormat.options) {
      if (format === "CUSTOM") {
        expect(sectionsForFormat("CUSTOM")).toEqual([]);
        continue;
      }
      const sections = sectionsForFormat(format);
      expect(sections.length).toBe(DEFAULT_SECTIONS[format].length);
      sections.forEach((s, i) => expect(s.order).toBe(i));
    }
  });
});

describe("sessions", () => {
  it("round-trips a valid session", () => {
    expect(() => Session.parse(session)).not.toThrow();
  });
  it("CreateSessionInput requires a client label and defaults source", () => {
    expect(CreateSessionInput.parse({ clientLabel: "A" }).source).toBe("live");
    expect(() => CreateSessionInput.parse({})).toThrow();
  });
});

describe("notes", () => {
  it("round-trips a valid note", () => {
    expect(() => Note.parse(note)).not.toThrow();
  });
  it("rejects an out-of-range confidence", () => {
    const seg = { speaker: "client", start: 0, end: 1, text: "hi", confidence: 2 };
    expect(() => TranscriptSegment.parse(seg)).toThrow();
  });
  it("renderNoteText concatenates section titles + content", () => {
    expect(renderNoteText(note)).toContain("SUBJECTIVE");
  });
});

describe("realtime protocol", () => {
  it("parses valid client + server messages", () => {
    expect(() => ClientMessage.parse({ type: "start", sessionId: "sess_1" })).not.toThrow();
    expect(() =>
      ServerMessage.parse({ type: "partial", text: "hi", speaker: "client" }),
    ).not.toThrow();
  });
  it("rejects an unknown message type", () => {
    expect(() => ServerMessage.parse({ type: "explode" })).toThrow();
  });
});
