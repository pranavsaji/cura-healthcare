import {
  type Session,
  type TranscriptSegment,
  type NoteTemplate,
  type Note,
  type NoteSection,
  sectionsForFormat,
} from "@cura/shared";

/**
 * Object factories producing valid domain objects with deterministic defaults.
 * Every factory takes an `overrides` partial so tests only specify what matters.
 * Values are fixed (no Date.now/random) so tests stay reproducible.
 */

const FIXED_TS = "2026-01-01T00:00:00.000Z";

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess_test",
    orgId: "org_test",
    clinicianId: "user_test",
    clientId: null,
    clientLabel: "S. Mitchell · 32F",
    modality: "CBT",
    source: "live",
    status: "created",
    consentAt: null,
    startedAt: null,
    endedAt: null,
    createdAt: FIXED_TS,
    ...overrides,
  };
}

export function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    speaker: "client",
    start: 0,
    end: 2,
    text: "I have been feeling anxious this week.",
    confidence: 0.9,
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<NoteTemplate> = {}): NoteTemplate {
  return {
    id: "tmpl_soap",
    orgId: "org_test",
    name: "SOAP — Progress Note",
    format: "SOAP",
    sections: sectionsForFormat("SOAP"),
    styleExamples: [],
    modalityHints: [],
    isDefault: true,
    ...overrides,
  };
}

export function makeNoteSection(overrides: Partial<NoteSection> = {}): NoteSection {
  return {
    key: "subjective",
    title: "Subjective",
    content: "Client reports increased anxiety and poor sleep.",
    evidence: [0],
    ...overrides,
  };
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note_test",
    orgId: "org_test",
    sessionId: "sess_test",
    templateId: "tmpl_soap",
    format: "SOAP",
    sections: [makeNoteSection()],
    riskFlags: [],
    status: "draft",
    model: "mock",
    promptVersion: "notegen-v1",
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
    ...overrides,
  };
}
