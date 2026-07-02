import type { AgentMemory } from "./types.js";

/**
 * In-memory, per-tenant agent memory. One instance is scoped to a single
 * `orgId`, so there is no code path that reads another tenant's memory
 * (CONVENTIONS §2). A Postgres/Redis-backed implementation satisfies the same
 * {@link AgentMemory} interface for prod persistence.
 */
export class InMemoryAgentMemory implements AgentMemory {
  private readonly store = new Map<string, string>();

  constructor(readonly orgId: string) {}

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async all(): Promise<Record<string, string>> {
    return Object.fromEntries(this.store);
  }
}

/**
 * A per-org memory registry: hands out a memory instance per tenant and never
 * mixes them. Used by the app to keep long-lived learning per organization.
 */
export class TenantMemoryRegistry {
  private readonly byOrg = new Map<string, InMemoryAgentMemory>();

  forOrg(orgId: string): AgentMemory {
    let mem = this.byOrg.get(orgId);
    if (!mem) {
      mem = new InMemoryAgentMemory(orgId);
      this.byOrg.set(orgId, mem);
    }
    return mem;
  }
}
