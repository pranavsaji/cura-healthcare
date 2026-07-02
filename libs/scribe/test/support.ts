import { FixedClock } from "@cura/core";
import { createAuditLog, type AuditLog, type AuditStore } from "@cura/audit";
import { MemoryStore } from "@cura/db";
import { MockAsrProvider, type AsrProvider } from "@cura/transcription";
import type { AuditEvent } from "@cura/shared";
import { createScribeServices, MemoryObjectStore, type ObjectStore, type ScribeServices } from "../src/index.js";

/** Minimal in-memory audit store (hash chain lives in `@cura/audit`). */
export class InMemoryAuditStore implements AuditStore {
  events: AuditEvent[] = [];
  async append(e: Parameters<AuditStore["append"]>[0]): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: e.id ?? `audit_${this.events.length + 1}`,
      orgId: e.orgId,
      actor: e.actor,
      action: e.action,
      resource: e.resource,
      phiTouched: e.phiTouched,
      context: e.context,
      prevHash: e.prevHash,
      hash: e.hash,
      createdAt: (e.createdAt ?? new Date()).toISOString(),
    };
    this.events.push(event);
    return event;
  }
  async lastHash(orgId: string): Promise<string | null> {
    const forOrg = this.events.filter((e) => e.orgId === orgId);
    return forOrg.length ? forOrg[forOrg.length - 1]!.hash : null;
  }
  async list(orgId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.orgId === orgId);
  }
}

export interface Harness {
  services: ScribeServices;
  store: MemoryStore;
  audit: AuditLog;
  auditStore: InMemoryAuditStore;
  objectStore: ObjectStore;
  asr: AsrProvider;
  clock: FixedClock;
  /** All audit actions recorded so far (any org). */
  actions(): string[];
}

/** Build a fully-wired scribe harness over in-memory infra for a given tenant. */
export function makeHarness(
  scope: { orgId: string; userId: string } = { orgId: "org_a", userId: "user_a" },
  opts: { asr?: AsrProvider; objectStore?: ObjectStore; retentionDays?: number } = {},
): Harness {
  const clock = new FixedClock("2026-06-01T00:00:00.000Z");
  const auditStore = new InMemoryAuditStore();
  const audit = createAuditLog({ store: auditStore, clock });
  const asr = opts.asr ?? new MockAsrProvider();
  const objectStore = opts.objectStore ?? new MemoryObjectStore();
  const services = createScribeServices({
    asr,
    objectStore,
    audit,
    clock,
    ...(opts.retentionDays !== undefined ? { retentionDays: opts.retentionDays } : {}),
  });
  const store = new MemoryStore(scope);
  return {
    services,
    store,
    audit,
    auditStore,
    objectStore,
    asr,
    clock,
    actions: () => auditStore.events.map((e) => e.action),
  };
}

/** Audio buffer for the mock batch path: newline-delimited `speaker: text`. */
export function fakeAudio(lines: string[]): Buffer {
  return Buffer.from(lines.join("\n"), "utf8");
}
