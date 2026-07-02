import { z } from "zod";
import { TranscriptSegment, NoteSection, RiskFlag } from "./notes.js";

/**
 * WebSocket message contract between the product app and the realtime gateway.
 * Client → server and server → client messages share one discriminated union.
 */

// ── Client → Server ──────────────────────────────────────────────────
export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), sessionId: z.string() }),
  // base64-encoded PCM16 audio chunk (dev-friendly; binary frames in prod)
  z.object({ type: z.literal("audio"), chunk: z.string() }),
  z.object({ type: z.literal("stop") }),
  // dev helper: drive the mock ASR with a line of text
  z.object({ type: z.literal("simulate"), text: z.string(), speaker: z.enum(["clinician", "client"]).optional() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ── Server → Client ──────────────────────────────────────────────────
export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), sessionId: z.string() }),
  z.object({ type: z.literal("partial"), text: z.string(), speaker: z.enum(["clinician", "client", "unknown"]) }),
  z.object({ type: z.literal("segment"), segment: TranscriptSegment }),
  z.object({ type: z.literal("note.status"), status: z.enum(["queued", "generating", "done", "error"]) }),
  z.object({ type: z.literal("note.section"), section: NoteSection }),
  z.object({ type: z.literal("note.risk"), flag: RiskFlag }),
  z.object({ type: z.literal("note.done"), noteId: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
