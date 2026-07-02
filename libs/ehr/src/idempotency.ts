import { createHash } from "node:crypto";

/**
 * Idempotency keys prevent duplicate notes when a sync is retried or double-
 * enqueued. The key is a pure function of the *logical* write — org + note +
 * vendor — so every attempt for the same note produces the same key, and a
 * different org (or vendor) can never collide with another's write (tenant
 * isolation by construction, Phase 13 mandate).
 */
export interface IdempotencyInput {
  orgId: string;
  noteId: string;
  vendor: string;
}

export function idempotencyKey(input: IdempotencyInput): string {
  const canonical = `${input.orgId}:${input.vendor}:${input.noteId}`;
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
