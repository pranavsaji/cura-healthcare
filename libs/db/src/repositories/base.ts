import { sql } from "drizzle-orm";
import type { Clock, IdGen } from "@cura/core";
import type { Encryptor } from "../encryption.js";
import type { Database } from "../client.js";

/**
 * Shared dependencies every repository needs. Injected (not imported globally)
 * so tests get a deterministic clock/id generator and a chosen encryptor.
 */
export interface RepoDeps {
  clock: Clock;
  ids: IdGen;
  encryptor: Encryptor;
}

/**
 * Base for all repositories. Enforces the tenancy rule from CONVENTIONS §2:
 * **every** query is scoped to an `orgId` passed explicitly by the caller —
 * there is no method that reads/writes without a tenant. As defense-in-depth,
 * {@link withTenant} also sets the Postgres `app.org_id` GUC so RLS policies (if
 * enabled) reject cross-tenant rows at the database level.
 */
export abstract class BaseRepo {
  constructor(
    protected readonly db: Database,
    protected readonly deps: RepoDeps,
  ) {}

  /** ISO-8601 (what domain types use) from a nullable DB timestamp. */
  protected iso(d: Date | null | undefined): string | null {
    return d ? d.toISOString() : null;
  }

  /** Non-null ISO for required timestamps (created_at etc.). */
  protected isoReq(d: Date): string {
    return d.toISOString();
  }

  /**
   * Run `fn` inside a transaction with `app.org_id` set to `orgId`, so any
   * RLS policy keyed on `current_setting('app.org_id')` is active for the whole
   * unit of work. Use for multi-statement writes that must be tenant-consistent.
   */
  protected async withTenant<T>(orgId: string, fn: (tx: Database) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
      return fn(tx as unknown as Database);
    });
  }
}
