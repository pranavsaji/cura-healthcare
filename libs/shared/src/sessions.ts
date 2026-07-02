import { z } from "zod";

export const SESSION_SOURCES = ["live", "dictation", "upload"] as const;
export const SessionSource = z.enum(SESSION_SOURCES);
export type SessionSource = z.infer<typeof SessionSource>;

export const SESSION_STATUSES = [
  "created",
  "recording",
  "transcribing",
  "ready", // transcript ready, note not yet generated
  "noted", // note generated
] as const;
export const SessionStatus = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const Session = z.object({
  id: z.string(),
  orgId: z.string(),
  clinicianId: z.string(),
  clientId: z.string().nullable(),
  clientLabel: z.string(), // de-identified display label, e.g. "S. Mitchell · 32F"
  modality: z.string().nullable(),
  source: SessionSource,
  status: SessionStatus,
  consentAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Session = z.infer<typeof Session>;

export const CreateSessionInput = z.object({
  clientLabel: z.string().min(1),
  clientId: z.string().nullable().optional(),
  modality: z.string().nullable().optional(),
  source: SessionSource.default("live"),
  templateId: z.string().optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInput>;
