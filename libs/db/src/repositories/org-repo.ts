import { eq } from "drizzle-orm";
import { organizations } from "../schema.js";
import { BaseRepo } from "./base.js";
import type { Org } from "./types.js";

type OrgRow = typeof organizations.$inferSelect;

/** Organizations (tenants). The only repo not scoped by orgId — it *is* orgs. */
export class OrgRepo extends BaseRepo {
  private map(r: OrgRow): Org {
    return {
      id: r.id,
      name: r.name,
      workosOrgId: r.workosOrgId,
      dataResidency: r.dataResidency,
      retentionDays: r.retentionDays,
      createdAt: this.isoReq(r.createdAt),
    };
  }

  async create(input: {
    name: string;
    workosOrgId?: string | null;
    dataResidency?: string;
    retentionDays?: number;
    id?: string;
  }): Promise<Org> {
    const [row] = await this.db
      .insert(organizations)
      .values({
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        workosOrgId: input.workosOrgId ?? null,
        ...(input.dataResidency ? { dataResidency: input.dataResidency } : {}),
        ...(input.retentionDays ? { retentionDays: input.retentionDays } : {}),
      })
      .returning();
    return this.map(row!);
  }

  async byId(orgId: string): Promise<Org | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row ? this.map(row) : null;
  }

  /** Resolve the cura org for a WorkOS organization id (SSO/SCIM mapping). */
  async byWorkosOrgId(workosOrgId: string): Promise<Org | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.workosOrgId, workosOrgId))
      .limit(1);
    return row ? this.map(row) : null;
  }
}
