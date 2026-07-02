import { and, desc, eq, lt } from "drizzle-orm";
import { type Session, type Paginated, SessionSource, SessionStatus } from "@cura/shared";
import { sessions } from "../schema.js";
import { BaseRepo } from "./base.js";

type SessionRow = typeof sessions.$inferSelect;

/** Sessions (encounters). Tenant-scoped; keyset-paginated by `createdAt`. */
export class SessionRepo extends BaseRepo {
  private map(r: SessionRow): Session {
    return {
      id: r.id,
      orgId: r.orgId,
      clinicianId: r.clinicianId,
      clientId: r.clientId,
      clientLabel: r.clientLabel,
      modality: r.modality,
      source: SessionSource.parse(r.source),
      status: SessionStatus.parse(r.status),
      consentAt: this.iso(r.consentAt),
      startedAt: this.iso(r.startedAt),
      endedAt: this.iso(r.endedAt),
      createdAt: this.isoReq(r.createdAt),
    };
  }

  async create(
    orgId: string,
    input: {
      clinicianId: string;
      clientId?: string | null;
      clientLabel: string;
      templateId?: string | null;
      modality?: string | null;
      source?: Session["source"];
      id?: string;
    },
  ): Promise<Session> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        ...(input.id ? { id: input.id } : {}),
        orgId,
        clinicianId: input.clinicianId,
        clientId: input.clientId ?? null,
        clientLabel: input.clientLabel,
        templateId: input.templateId ?? null,
        modality: input.modality ?? null,
        ...(input.source ? { source: input.source } : {}),
      })
      .returning();
    return this.map(row!);
  }

  /** The chosen template id for a session (not part of the domain Session type). */
  async templateId(orgId: string, id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ templateId: sessions.templateId })
      .from(sessions)
      .where(and(eq(sessions.orgId, orgId), eq(sessions.id, id)))
      .limit(1);
    return row?.templateId ?? null;
  }

  async byId(orgId: string, id: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.orgId, orgId), eq(sessions.id, id)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  /** Keyset pagination: newest first, cursor = createdAt of the last item. */
  async list(
    orgId: string,
    opts: { limit?: number; before?: string } = {},
  ): Promise<Paginated<Session>> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const where = opts.before
      ? and(eq(sessions.orgId, orgId), lt(sessions.createdAt, new Date(opts.before)))
      : eq(sessions.orgId, orgId);
    const rows = await this.db
      .select()
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.createdAt))
      .limit(limit + 1);
    const items = rows.slice(0, limit).map((r) => this.map(r));
    const nextCursor = rows.length > limit ? items[items.length - 1]!.createdAt : null;
    return { items, nextCursor };
  }

  async update(orgId: string, id: string, patch: Partial<Session>): Promise<Session | null> {
    const [row] = await this.db
      .update(sessions)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.modality !== undefined ? { modality: patch.modality } : {}),
        ...(patch.consentAt !== undefined
          ? { consentAt: patch.consentAt ? new Date(patch.consentAt) : null }
          : {}),
        ...(patch.startedAt !== undefined
          ? { startedAt: patch.startedAt ? new Date(patch.startedAt) : null }
          : {}),
        ...(patch.endedAt !== undefined
          ? { endedAt: patch.endedAt ? new Date(patch.endedAt) : null }
          : {}),
      })
      .where(and(eq(sessions.orgId, orgId), eq(sessions.id, id)))
      .returning();
    return row ? this.map(row) : null;
  }
}
