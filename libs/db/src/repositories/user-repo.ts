import { and, eq } from "drizzle-orm";
import { Role } from "@cura/shared";
import { users } from "../schema.js";
import { BaseRepo } from "./base.js";
import type { Member } from "./types.js";

type UserRow = typeof users.$inferSelect;

/** Members of an organization. Every method is tenant-scoped by `orgId`. */
export class UserRepo extends BaseRepo {
  private map(r: UserRow): Member {
    return {
      id: r.id,
      orgId: r.orgId,
      email: r.email,
      name: r.name,
      // Role strings are validated on read so a bad DB value can't flow inward.
      role: Role.parse(r.role),
      workosUserId: r.workosUserId,
      createdAt: this.isoReq(r.createdAt),
    };
  }

  async create(
    orgId: string,
    input: {
      email: string;
      name: string;
      role?: Member["role"];
      workosUserId?: string | null;
      id?: string;
    },
  ): Promise<Member> {
    const [row] = await this.db
      .insert(users)
      .values({
        ...(input.id ? { id: input.id } : {}),
        orgId,
        email: input.email,
        name: input.name,
        ...(input.role ? { role: input.role } : {}),
        workosUserId: input.workosUserId ?? null,
      })
      .returning();
    return this.map(row!);
  }

  async byId(orgId: string, id: string): Promise<Member | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async list(orgId: string): Promise<Member[]> {
    const rows = await this.db.select().from(users).where(eq(users.orgId, orgId));
    return rows.map((r) => this.map(r));
  }

  /** Look up a member by their WorkOS user id (SSO/SCIM reconciliation). */
  async byWorkosUserId(orgId: string, workosUserId: string): Promise<Member | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.workosUserId, workosUserId)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  /** Update a member's role (directory group → role mapping). */
  async updateRole(orgId: string, id: string, role: Member["role"]): Promise<Member | null> {
    const [row] = await this.db
      .update(users)
      .set({ role })
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .returning();
    return row ? this.map(row) : null;
  }
}
