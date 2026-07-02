import { PostgresStore, MemoryStore, type Repositories, type Store } from "@cura/db";

/**
 * Produces a tenant-scoped {@link Store} for a request. The gateway derives the
 * tenant from the authenticated {@link TenantContext} and asks the factory for a
 * store bound to that org — so no handler can accidentally touch another tenant's
 * data (CONVENTIONS §2). Both the in-memory (dev/test) and Postgres backends
 * implement the same factory contract.
 */
export interface StoreFactory {
  forTenant(ctx: { orgId: string; userId: string }): Promise<Store>;
}

/**
 * Dev/test factory: one in-memory dataset per org, reused across requests so
 * multi-step flows (create → generate → sign) persist. `userId` is the acting
 * clinician for created sessions.
 */
export class MemoryStoreFactory implements StoreFactory {
  private readonly byOrg = new Map<string, MemoryStore>();

  async forTenant(ctx: { orgId: string; userId: string }): Promise<Store> {
    let store = this.byOrg.get(ctx.orgId);
    if (!store) {
      store = new MemoryStore({ orgId: ctx.orgId, userId: ctx.userId });
      this.byOrg.set(ctx.orgId, store);
    }
    return store;
  }
}

/** Postgres factory: a {@link PostgresStore} scoped to the request's tenant. */
export class PostgresStoreFactory implements StoreFactory {
  constructor(private readonly repos: Repositories) {}

  async forTenant(ctx: { orgId: string; userId: string }): Promise<Store> {
    return new PostgresStore(this.repos, { orgId: ctx.orgId, clinicianId: ctx.userId });
  }
}
