import type { AuditEvent } from "@cura/shared";
import type { AuditStore } from "@cura/audit";

/**
 * In-memory {@link AuditStore} for the dev/test platform. Preserves the same
 * append-only, per-org ordering the Postgres `AuditRepo` guarantees, so the
 * hash-chain logic in `@cura/audit` behaves identically offline. Not durable —
 * process memory only.
 */
export class InMemoryAuditStore implements AuditStore {
  private readonly byOrg = new Map<string, AuditEvent[]>();

  async append(event: {
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
  }): Promise<AuditEvent> {
    const row: AuditEvent = {
      id: event.id ?? `audit_${this.count(event.orgId) + 1}`,
      orgId: event.orgId,
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      phiTouched: event.phiTouched,
      context: event.context,
      prevHash: event.prevHash,
      hash: event.hash,
      createdAt: (event.createdAt ?? new Date()).toISOString(),
    };
    const list = this.byOrg.get(event.orgId) ?? [];
    list.push(row);
    this.byOrg.set(event.orgId, list);
    return row;
  }

  async lastHash(orgId: string): Promise<string | null> {
    const list = this.byOrg.get(orgId);
    return list && list.length > 0 ? list[list.length - 1]!.hash : null;
  }

  async list(orgId: string): Promise<AuditEvent[]> {
    return [...(this.byOrg.get(orgId) ?? [])];
  }

  private count(orgId: string): number {
    return this.byOrg.get(orgId)?.length ?? 0;
  }
}
