import { z } from "zod";

/** Auditable actions. Extend as verticals add capabilities (keep stable strings). */
export const AUDIT_ACTIONS = [
  "session.created",
  "session.consent",
  "session.started",
  "session.stopped",
  "recording.uploaded",
  "recording.deleted",
  "transcript.created",
  "note.generated",
  "note.edited",
  "note.signed",
  "note.synced",
  "note.sync.attempted",
  "note.sync.succeeded",
  "note.sync.failed",
  "note.sync.dead_letter",
  "auth.login",
  "auth.denied",
  "policy.updated",
  "claim.submitted",
  "call.handled",
] as const;
export const AuditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditAction>;

/**
 * An immutable audit event. Persisted in a hash chain (`prevHash → hash`) by
 * `@cura/audit` (Phase 04) so the log is tamper-evident. `context` must never
 * contain PHI — ids and metadata only.
 */
export const AuditEvent = z.object({
  id: z.string(),
  orgId: z.string(),
  actor: z.string(), // userId or "system"
  action: AuditAction,
  resource: z.string(), // e.g. "note:note_123"
  phiTouched: z.boolean().default(false),
  context: z.record(z.unknown()).default({}),
  prevHash: z.string().nullable(),
  hash: z.string(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/** Input to record a new audit event (hash/id/timestamp filled by the recorder). */
export const AuditInput = AuditEvent.pick({
  orgId: true,
  actor: true,
  action: true,
  resource: true,
  phiTouched: true,
  context: true,
}).partial({ phiTouched: true, context: true });
export type AuditInput = z.infer<typeof AuditInput>;
