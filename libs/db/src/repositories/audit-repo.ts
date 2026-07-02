import { and, asc, desc, eq } from "drizzle-orm";
import { type AuditEvent, AuditAction } from "@cura/shared";
import { auditEvents } from "../schema.js";
import { BaseRepo } from "./base.js";

type AuditRow = typeof auditEvents.$inferSelect;

/**
 * Append-only audit log store. The hash chain is computed by `@cura/audit`
 * (Phase 04); this repo only persists and reads events in tenant + time order.
 */
export class AuditRepo extends BaseRepo {
  private map(r: AuditRow): AuditEvent {
    return {
      id: r.id,
      orgId: r.orgId,
      actor: r.actor,
      action: AuditAction.parse(r.action),
      resource: r.resource,
      phiTouched: r.phiTouched,
      context: r.context,
      prevHash: r.prevHash,
      hash: r.hash,
      createdAt: this.isoReq(r.createdAt),
    };
  }

  /** Insert a pre-hashed event. `id`/`createdAt` fall back to DB defaults. */
  async append(event: {
    orgId: string;
    actor: string;
    action: AuditEvent["action"];
    resource: string;
    phiTouched: boolean;
    context: Record<string, unknown>;
    prevHash: string | null;
    hash: string;
    id?: string;
    createdAt?: Date;
  }): Promise<AuditEvent> {
    const [row] = await this.db
      .insert(auditEvents)
      .values({
        ...(event.id ? { id: event.id } : {}),
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
        orgId: event.orgId,
        actor: event.actor,
        action: event.action,
        resource: event.resource,
        phiTouched: event.phiTouched,
        context: event.context,
        prevHash: event.prevHash,
        hash: event.hash,
      })
      .returning();
    return this.map(row!);
  }

  /** The most recent event's hash for this org (chain head), or null if empty. */
  async lastHash(orgId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ hash: auditEvents.hash })
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId))
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(1);
    return row?.hash ?? null;
  }

  /** All events for an org in chain (chronological) order. */
  async list(orgId: string): Promise<AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId))
      .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));
    return rows.map((r) => this.map(r));
  }

  /** Raw hash of a single event by id (used by tamper tests + inspectors). */
  async hashOf(orgId: string, id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ hash: auditEvents.hash })
      .from(auditEvents)
      .where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.id, id)))
      .limit(1);
    return row?.hash ?? null;
  }
}
