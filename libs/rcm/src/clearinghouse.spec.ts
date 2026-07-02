import { describe, expect, it } from "vitest";
import { MockClearinghouse, type Clearinghouse } from "./clearinghouse.js";
import { build837 } from "./x12/x837.js";
import { Claim } from "./types.js";

const claim = Claim.parse({
  id: "CLM1001", orgId: "org-1", payerId: "60054", memberId: "M1", npi: "1999999984",
  diagnoses: ["F411"], serviceLines: [{ cpt: "90837", chargeCents: 15000 }], serviceDate: "20260615",
});
const validEdi = build837(claim);

const adapters: { name: string; make: () => Clearinghouse }[] = [
  { name: "mock", make: () => new MockClearinghouse() },
];

describe.each(adapters)("Clearinghouse contract: $name", ({ make }) => {
  it("accepts a well-formed 837 and returns a trace number", async () => {
    const res = await make().submit(claim.id, validEdi, "key-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe("accepted");
      expect(res.value.traceNumber).toMatch(/TRACE-/);
    }
  });

  it("rejects a malformed 837 with a typed error (no throw)", async () => {
    const res = await make().submit(claim.id, "NOT-EDI", "key-2");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("rejected");
  });

  it("is idempotent: the same key never double-files", async () => {
    const ch = make();
    const a = await ch.submit(claim.id, validEdi, "key-3");
    const b = await ch.submit(claim.id, validEdi, "key-3");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.traceNumber).toBe(b.value.traceNumber);
  });

  it("tracks a submitted claim's status", async () => {
    const ch = make();
    await ch.submit(claim.id, validEdi, "key-4");
    const status = await ch.track(claim.id);
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.value).toBe("accepted");
  });
});
