import { z } from "zod";
import { NoteFormat } from "./templates.js";

export const NOTE_STATUSES = ["draft", "reviewed", "signed", "synced"] as const;
export const NoteStatus = z.enum(NOTE_STATUSES);
export type NoteStatus = z.infer<typeof NoteStatus>;

/** A transcript segment with speaker diarization + evidence timing. */
export const TranscriptSegment = z.object({
  speaker: z.enum(["clinician", "client", "unknown"]),
  start: z.number(), // seconds
  end: z.number(),
  text: z.string(),
  confidence: z.number().min(0).max(1).default(1),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

/** One generated section of a note, with links back to transcript evidence. */
export const NoteSection = z.object({
  key: z.string(),
  title: z.string(),
  content: z.string(),
  /** start-times (seconds) of transcript segments this section draws from. */
  evidence: z.array(z.number()).default([]),
});
export type NoteSection = z.infer<typeof NoteSection>;

export const RISK_KINDS = [
  "suicidal_ideation",
  "homicidal_ideation",
  "abuse",
  "mandated_reporting",
] as const;
export const RiskFlag = z.object({
  kind: z.enum(RISK_KINDS),
  severity: z.enum(["info", "warning", "critical"]),
  quote: z.string(),
  segmentStart: z.number().nullable(),
});
export type RiskFlag = z.infer<typeof RiskFlag>;

export const Note = z.object({
  id: z.string(),
  orgId: z.string(),
  sessionId: z.string(),
  templateId: z.string().nullable(),
  format: NoteFormat,
  sections: z.array(NoteSection),
  riskFlags: z.array(RiskFlag).default([]),
  status: NoteStatus,
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Note = z.infer<typeof Note>;

/** Render a note to plain text for copy-to-clipboard / EHR paste fallback. */
export function renderNoteText(note: Pick<Note, "sections">): string {
  return note.sections
    .map((s) => `${s.title.toUpperCase()}\n${s.content.trim()}`)
    .join("\n\n");
}
