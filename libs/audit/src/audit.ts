import type { AuditEvent, AuditInput } from "@cura/shared";
import type { Clock, IdGen } from "@cura/core";
import { systemClock, uuidIdGen } from "@cura/core";
import { computeHash } from "./hash.js";

/**
 * Minimal persistence contract the audit log needs. `@cura/db`'s `AuditRepo`
 * satisfies it structurally; tests pass an in-memory fake. Keeping it structural
 * means the hash-chain logic is unit-testable without a database.
 */
export interface AuditStore {
  append(event: {
    id?: string;
    createdAt?: Date;
    orgId: string;
    actor: string;
    action: AuditEvent["action"];
    resource: string;
    phiTouched: boolean;
    context: Record<string, unknown>;
    prevHash: string | null;
    hash: string;
  }): Promise<AuditEvent>;
  lastHash(orgId: string): Promise<string | null>;
  list(orgId: string): Promise<AuditEvent[]>;
}

export interface AuditDeps {
  store: AuditStore;
  clock?: Clock;
  ids?: IdGen;
}

/** Result of verifying an org's chain. `ok=false` pinpoints the first break. */
export interface ChainVerification {
  ok: boolean;
  length: number;
  /** Index (0-based) of the first tampered/broken event, if any. */
  brokenAt?: number;
  /** Id of that event, if any. */
  brokenId?: string;
  reason?: "hash_mismatch" | "chain_broken";
}

export interface AuditLog {
  /** Append a new event, chaining it onto the org's current head. */
  record(input: AuditInput): Promise<AuditEvent>;
  /** Recompute the whole chain and detect the first tampered link. */
  verifyChain(orgId: string): Promise<ChainVerification>;
  /** Ordered events for an org (run inspector / replay). */
  replay(orgId: string): Promise<AuditEvent[]>;
}

/**
 * Build the reusable audit log. One helper used identically by all three
 * verticals (CONVENTIONS §2): `audit.record(ctx, action, resource, meta)`.
 */
export function createAuditLog(deps: AuditDeps): AuditLog {
  const clock = deps.clock ?? systemClock;
  const ids = deps.ids ?? uuidIdGen;
  const store = deps.store;

  return {
    async record(input: AuditInput): Promise<AuditEvent> {
      const prevHash = await store.lastHash(input.orgId);
      const createdAtIso = clock.nowIso();
      const chainable = {
        // Bare id (uuid in prod) — audit_events.id is a uuid column.
        id: ids.next(),
        orgId: input.orgId,
        actor: input.actor,
        action: input.action,
        resource: input.resource,
        phiTouched: input.phiTouched ?? false,
        context: input.context ?? {},
        prevHash,
        createdAt: createdAtIso,
      };
      const hash = computeHash(chainable, prevHash);
      return store.append({
        id: chainable.id,
        createdAt: new Date(createdAtIso),
        orgId: chainable.orgId,
        actor: chainable.actor,
        action: chainable.action,
        resource: chainable.resource,
        phiTouched: chainable.phiTouched,
        context: chainable.context,
        prevHash,
        hash,
      });
    },

    async verifyChain(orgId: string): Promise<ChainVerification> {
      const events = await store.list(orgId);
      let prevHash: string | null = null;
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!;
        // (1) the link must point at the previous stored hash.
        if (e.prevHash !== prevHash) {
          return {
            ok: false,
            length: events.length,
            brokenAt: i,
            brokenId: e.id,
            reason: "chain_broken",
          };
        }
        // (2) recomputing the hash must reproduce the stored hash.
        if (computeHash(e, prevHash) !== e.hash) {
          return {
            ok: false,
            length: events.length,
            brokenAt: i,
            brokenId: e.id,
            reason: "hash_mismatch",
          };
        }
        prevHash = e.hash;
      }
      return { ok: true, length: events.length };
    },

    replay(orgId: string): Promise<AuditEvent[]> {
      return store.list(orgId);
    },
  };
}

/** Convenience wrapper matching the `audit.record(ctx, action, resource, meta)` shape. */
export function recordAction(
  log: AuditLog,
  ctx: { orgId: string; actor: string },
  action: AuditEvent["action"],
  resource: string,
  meta?: { phiTouched?: boolean; context?: Record<string, unknown> },
): Promise<AuditEvent> {
  return log.record({
    orgId: ctx.orgId,
    actor: ctx.actor,
    action,
    resource,
    phiTouched: meta?.phiTouched,
    context: meta?.context,
  });
}
