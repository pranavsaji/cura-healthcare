import { describe, it, expect } from "vitest";
import type { AuditEvent } from "@cura/shared";
import { FixedClock, fixedIdGen } from "@cura/core";
import { createAuditLog, type AuditStore } from "./audit.js";
import { canonicalize, computeHash, stableStringify } from "./hash.js";

/** In-memory audit store exposing its rows so tests can tamper with them. */
class InMemoryAuditStore implements AuditStore {
  rows: AuditEvent[] = [];
  private seq = 0;

  async append(event: Parameters<AuditStore["append"]>[0]): Promise<AuditEvent> {
    const row: AuditEvent = {
      id: event.id ?? `row_${(this.seq += 1)}`,
      orgId: event.orgId,
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      phiTouched: event.phiTouched,
      context: event.context,
      prevHash: event.prevHash,
      hash: event.hash,
      createdAt: (event.createdAt ?? new Date(0)).toISOString(),
    };
    this.rows.push(row);
    return row;
  }
  async lastHash(orgId: string): Promise<string | null> {
    const forOrg = this.rows.filter((r) => r.orgId === orgId);
    return forOrg.length ? forOrg[forOrg.length - 1]!.hash : null;
  }
  async list(orgId: string): Promise<AuditEvent[]> {
    return this.rows.filter((r) => r.orgId === orgId).map((r) => ({ ...r }));
  }
}

function makeLog() {
  const store = new InMemoryAuditStore();
  const log = createAuditLog({
    store,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: fixedIdGen("audit"),
  });
  return { store, log };
}

describe("stableStringify", () => {
  it("is key-order independent", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1}}');
  });
});

describe("audit hash chain", () => {
  it("records a linked chain and verifies clean", async () => {
    const { store, log } = makeLog();
    const e1 = await log.record({
      orgId: "org_1",
      actor: "user_1",
      action: "session.created",
      resource: "session:s1",
    });
    const e2 = await log.record({
      orgId: "org_1",
      actor: "user_1",
      action: "note.generated",
      resource: "note:n1",
      phiTouched: true,
    });

    expect(e1.prevHash).toBeNull();
    expect(e2.prevHash).toBe(e1.hash);
    expect(store.rows).toHaveLength(2);

    const v = await log.verifyChain("org_1");
    expect(v).toEqual({ ok: true, length: 2 });
  });

  it("isolates chains per org", async () => {
    const { log } = makeLog();
    await log.record({ orgId: "org_1", actor: "u", action: "auth.login", resource: "user:u" });
    const b1 = await log.record({
      orgId: "org_2",
      actor: "u",
      action: "auth.login",
      resource: "user:u",
    });
    expect(b1.prevHash).toBeNull(); // org_2's chain starts fresh
    expect((await log.verifyChain("org_1")).ok).toBe(true);
    expect((await log.verifyChain("org_2")).ok).toBe(true);
  });

  it("detects tampering with a stored field (hash mismatch at that row)", async () => {
    const { store, log } = makeLog();
    await log.record({
      orgId: "org_1",
      actor: "u",
      action: "session.created",
      resource: "session:s1",
    });
    await log.record({ orgId: "org_1", actor: "u", action: "note.edited", resource: "note:n1" });
    await log.record({ orgId: "org_1", actor: "u", action: "note.signed", resource: "note:n1" });

    // Tamper: change the resource of the middle event without fixing its hash.
    store.rows[1]!.resource = "note:HACKED";

    const v = await log.verifyChain("org_1");
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
    expect(v.reason).toBe("hash_mismatch");
  });

  it("detects a broken link (edited hash)", async () => {
    const { store, log } = makeLog();
    await log.record({
      orgId: "org_1",
      actor: "u",
      action: "session.created",
      resource: "session:s1",
    });
    await log.record({ orgId: "org_1", actor: "u", action: "note.generated", resource: "note:n1" });

    // Tamper: rewrite the first event's hash → link to event 2 no longer matches.
    store.rows[0]!.hash = "deadbeef";

    const v = await log.verifyChain("org_1");
    expect(v.ok).toBe(false);
    // Row 0 now fails its own hash recompute first.
    expect(v.brokenAt).toBe(0);
  });

  it("replay returns events in order", async () => {
    const { log } = makeLog();
    await log.record({ orgId: "org_1", actor: "u", action: "session.created", resource: "s1" });
    await log.record({ orgId: "org_1", actor: "u", action: "session.stopped", resource: "s1" });
    const events = await log.replay("org_1");
    expect(events.map((e) => e.action)).toEqual(["session.created", "session.stopped"]);
  });
});

describe("hash primitives", () => {
  it("canonicalize excludes prevHash/hash and is stable", () => {
    const base = {
      id: "a1",
      orgId: "o1",
      actor: "u1",
      action: "auth.login" as const,
      resource: "user:u1",
      phiTouched: false,
      context: { b: 2, a: 1 },
      createdAt: "2026-01-01T00:00:00.000Z",
      prevHash: null,
    };
    expect(canonicalize(base)).toBe(canonicalize({ ...base, prevHash: "whatever" }));
    // Different prevHash → different chained hash though canonical is identical.
    expect(computeHash(base, null)).not.toBe(computeHash(base, "x"));
  });
});
