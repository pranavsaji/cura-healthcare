import type { AuditStore } from "@cura/audit";
import type { AuditEvent } from "@cura/shared";

/**
 * Minimal in-memory {@link AuditStore} for the voice app's dev bootstrap + tests.
 * The hash chain itself is computed by `@cura/audit`; this only persists rows and
 * answers `lastHash`/`list` per tenant. Prod uses the Postgres audit store.
 */
export class MemoryAuditStore implements AuditStore {
  private readonly rows: AuditEvent[] = [];

  async append(event: Parameters<AuditStore["append"]>[0]): Promise<AuditEvent> {
    const row: AuditEvent = {
      ...event,
      id: event.id ?? `evt_${this.rows.length + 1}`,
      createdAt: (event.createdAt ?? new Date()).toISOString(),
    };
    this.rows.push(row);
    return row;
  }

  async lastHash(orgId: string): Promise<string | null> {
    const org = this.rows.filter((r) => r.orgId === orgId);
    return org.length ? org[org.length - 1]!.hash : null;
  }

  async list(orgId: string): Promise<AuditEvent[]> {
    return this.rows.filter((r) => r.orgId === orgId);
  }
}
