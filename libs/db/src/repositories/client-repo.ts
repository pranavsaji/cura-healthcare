import { and, eq } from "drizzle-orm";
import { clients } from "../schema.js";
import { BaseRepo } from "./base.js";
import type { ClientRecord } from "./types.js";

type ClientRow = typeof clients.$inferSelect;

/**
 * Clients (patients). `displayLabel` and `mrn` are PII and are envelope-
 * encrypted at rest — encrypted on write, decrypted on read, here only.
 */
export class ClientRepo extends BaseRepo {
  private map(r: ClientRow): ClientRecord {
    return {
      id: r.id,
      orgId: r.orgId,
      displayLabel: this.deps.encryptor.decrypt(r.displayLabel),
      mrn: this.deps.encryptor.decryptNullable(r.mrn),
      createdAt: this.isoReq(r.createdAt),
    };
  }

  async create(
    orgId: string,
    input: { displayLabel: string; mrn?: string | null; id?: string },
  ): Promise<ClientRecord> {
    const [row] = await this.db
      .insert(clients)
      .values({
        ...(input.id ? { id: input.id } : {}),
        orgId,
        displayLabel: this.deps.encryptor.encrypt(input.displayLabel),
        mrn: this.deps.encryptor.encryptNullable(input.mrn),
      })
      .returning();
    return this.map(row!);
  }

  async byId(orgId: string, id: string): Promise<ClientRecord | null> {
    const [row] = await this.db
      .select()
      .from(clients)
      .where(and(eq(clients.orgId, orgId), eq(clients.id, id)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async list(orgId: string): Promise<ClientRecord[]> {
    const rows = await this.db.select().from(clients).where(eq(clients.orgId, orgId));
    return rows.map((r) => this.map(r));
  }
}
