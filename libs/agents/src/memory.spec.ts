import { describe, expect, it } from "vitest";
import { InMemoryAgentMemory, TenantMemoryRegistry } from "./memory.js";

describe("agent memory", () => {
  it("reads back what it writes", async () => {
    const mem = new InMemoryAgentMemory("org-1");
    await mem.set("plan", "verify benefits then book");
    expect(await mem.get("plan")).toBe("verify benefits then book");
    expect(await mem.all()).toEqual({ plan: "verify benefits then book" });
  });

  it("keeps each tenant's memory strictly separate", async () => {
    const registry = new TenantMemoryRegistry();
    const a = registry.forOrg("org-a");
    const b = registry.forOrg("org-b");
    await a.set("secret", "A-only");
    expect(await b.get("secret")).toBeUndefined();
    // Same org → same instance (learning persists).
    expect(registry.forOrg("org-a")).toBe(a);
  });
});
