import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, fixedIdGen } from "@cura/core";
import { type AuditInput, err, ok } from "@cura/shared";
import { InMemoryJobStore } from "./stores.js";
import { type EhrSyncDeps, type EhrSyncRequest, runEhrSync } from "./sync.js";
import {
  type ClientQuery,
  type EhrCapabilities,
  type EhrClientRef,
  type EhrConnector,
  type EhrCredentials,
  type EhrNoteInput,
  type EhrNoteRef,
  type EhrResult,
  type SyncStatus,
  syncError,
} from "./types.js";

/** A fully scriptable connector that counts each step's invocations. */
class FakeConnector implements EhrConnector {
  readonly vendor = "fake";
  capabilities: EhrCapabilities = { findClient: true, createNote: true, attachEncounter: true, realtimeStatus: true };
  calls = { authenticate: 0, findClient: 0, createNote: 0, attach: 0, status: 0 };
  scripts: {
    authenticate?: EhrResult<void>[];
    findClient?: EhrResult<EhrClientRef>[];
    createNote?: EhrResult<EhrNoteRef>[];
    attach?: EhrResult<void>[];
  } = {};

  private next<T>(seq: EhrResult<T>[] | undefined, fallback: EhrResult<T>, i: number): EhrResult<T> {
    if (!seq || seq.length === 0) return fallback;
    return seq[Math.min(i, seq.length - 1)]!;
  }

  async authenticate(_c: EhrCredentials): Promise<EhrResult<void>> {
    const i = this.calls.authenticate++;
    return this.next(this.scripts.authenticate, ok(undefined), i);
  }
  async findClient(_c: EhrCredentials, _q: ClientQuery): Promise<EhrResult<EhrClientRef>> {
    const i = this.calls.findClient++;
    return this.next(this.scripts.findClient, ok({ externalId: "client-1", label: "Client A" }), i);
  }
  async createNote(_c: EhrCredentials, _cl: EhrClientRef, _n: EhrNoteInput, _k: string): Promise<EhrResult<EhrNoteRef>> {
    const i = this.calls.createNote++;
    return this.next(this.scripts.createNote, ok({ externalId: "note-ext-1" }), i);
  }
  async attachToEncounter(): Promise<EhrResult<void>> {
    const i = this.calls.attach++;
    return this.next(this.scripts.attach, ok(undefined), i);
  }
  async status(): Promise<EhrResult<SyncStatus>> {
    this.calls.status++;
    return ok("accepted");
  }
}

const creds: EhrCredentials = { orgId: "org-1", vendor: "fake", secrets: { accessToken: "t" } };
const request = (orgId = "org-1", noteId = "note-1"): EhrSyncRequest => ({
  orgId,
  noteId,
  vendor: "fake",
  creds: { ...creds, orgId },
  clientQuery: { label: "Client A" },
  note: { clientLabel: "Client A", format: "SOAP", text: "note body" },
});

describe("runEhrSync", () => {
  let jobStore: InMemoryJobStore;
  let audits: AuditInput[];
  let deps: (connector: EhrConnector, extra?: Partial<EhrSyncDeps>) => EhrSyncDeps;

  beforeEach(() => {
    jobStore = new InMemoryJobStore({ clock: new FixedClock(), ids: fixedIdGen("job") });
    audits = [];
    deps = (connector, extra) => ({
      connector,
      jobStore,
      audit: { record: async (i: AuditInput) => void audits.push(i) },
      sleep: async () => undefined, // no real waiting in tests
      retry: { attempts: 3, baseMs: 1 },
      ...extra,
    });
  });

  it("happy path: succeeds, persists the external note id, and audits", async () => {
    const c = new FakeConnector();
    const out = await runEhrSync(request(), deps(c));
    expect(out.status).toBe("succeeded");
    expect(out.externalNoteId).toBe("note-ext-1");
    expect(out.usedFallback).toBe(false);
    const [job] = await jobStore.list("org-1");
    expect(job?.status).toBe("succeeded");
    expect(audits.map((a) => a.action)).toContain("note.sync.succeeded");
  });

  it("retries a transient failure and eventually succeeds WITHOUT creating a duplicate note", async () => {
    const c = new FakeConnector();
    // createNote succeeds first try; the *attach* step fails transiently once.
    c.scripts.attach = [err(syncError("unavailable", "flaky")), ok(undefined)];
    const out = await runEhrSync(request(), deps(c));
    expect(out.status).toBe("succeeded");
    // The note was created exactly once across both attempts — the idempotency guarantee.
    expect(c.calls.createNote).toBe(1);
    expect(c.calls.attach).toBe(2);
  });

  it("does not re-create a note when a completed sync is re-enqueued (idempotency short-circuit)", async () => {
    const c = new FakeConnector();
    const first = await runEhrSync(request(), deps(c));
    const second = await runEhrSync(request(), deps(c)); // same logical write
    expect(second.jobId).toBe(first.jobId);
    expect(second.externalNoteId).toBe(first.externalNoteId);
    expect(c.calls.createNote).toBe(1); // never created a second note
  });

  it("degrades to the formatted-copy fallback on a non-retryable failure and audits the dead-letter", async () => {
    const c = new FakeConnector();
    c.scripts.authenticate = [err(syncError("auth", "bad token", { retryable: false }))];
    const out = await runEhrSync(request(), deps(c));
    expect(out.status).toBe("dead_letter");
    expect(out.usedFallback).toBe(true);
    expect(out.fallbackText).toContain("SOAP NOTE — Client A");
    expect(c.calls.createNote).toBe(0); // never reached the real note create
    expect(audits.map((a) => a.action)).toContain("note.sync.dead_letter");
    const [job] = await jobStore.list("org-1");
    expect(job?.status).toBe("dead_letter");
  });

  it("dead-letters after exhausting retries on a persistently failing sync", async () => {
    const c = new FakeConnector();
    c.scripts.createNote = [err(syncError("unavailable", "down"))]; // always fails (retryable)
    const out = await runEhrSync(request(), deps(c, { retry: { attempts: 3, baseMs: 1 } }));
    expect(out.status).toBe("dead_letter");
    expect(c.calls.createNote).toBe(3); // one per attempt
    const [job] = await jobStore.list("org-1");
    expect(job?.attempts).toBe(3);
  });

  it("streams status updates for the editor", async () => {
    const c = new FakeConnector();
    c.scripts.attach = [err(syncError("unavailable", "flaky")), ok(undefined)];
    const updates: string[] = [];
    await runEhrSync(request(), deps(c, { onStatus: (u) => updates.push(u.status) }));
    expect(updates).toContain("retrying");
    expect(updates).toContain("succeeded");
  });

  it("tenant isolation: a job for org-1 is invisible to org-2 and each org syncs independently", async () => {
    const c1 = new FakeConnector();
    const out1 = await runEhrSync(request("org-1"), deps(c1));
    // org-2 with the same noteId gets its OWN job + note (different idempotency key).
    const c2 = new FakeConnector();
    const out2 = await runEhrSync(request("org-2"), deps(c2));
    expect(out1.jobId).not.toBe(out2.jobId);
    expect(await jobStore.get("org-2", out1.jobId)).toBeNull(); // cross-org read denied
    expect((await jobStore.list("org-1"))).toHaveLength(1);
    expect((await jobStore.list("org-2"))).toHaveLength(1);
  });
});
