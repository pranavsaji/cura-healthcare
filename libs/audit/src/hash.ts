import { createHash } from "node:crypto";
import type { AuditEvent } from "@cura/shared";

/**
 * Canonical serialization + hash chaining for the tamper-evident audit log.
 * Each event's `hash = SHA-256( canonical(event) | prevHash )`, so any change to
 * a stored field — or to an earlier link — breaks verification at exactly that
 * row. Serialization is stable (recursively key-sorted) so the same logical
 * event always hashes identically across processes/languages.
 */

/** The event fields that are covered by the hash (everything except the hash). */
export type ChainableEvent = Omit<AuditEvent, "hash">;

/** Deterministic JSON: object keys sorted recursively; arrays keep order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

/** The exact string that gets hashed for an event (excludes `prevHash`/`hash`). */
export function canonicalize(event: ChainableEvent): string {
  return stableStringify({
    id: event.id,
    orgId: event.orgId,
    actor: event.actor,
    action: event.action,
    resource: event.resource,
    phiTouched: event.phiTouched,
    context: event.context,
    createdAt: event.createdAt,
  });
}

/** Compute the chained hash for an event given the previous link's hash. */
export function computeHash(event: ChainableEvent, prevHash: string | null): string {
  return createHash("sha256")
    .update(canonicalize(event))
    .update("|")
    .update(prevHash ?? "")
    .digest("hex");
}
