import { describe, expect, it } from "vitest";
import { MockBenefitsVerifier } from "./mock.js";
import type { BenefitsVerifier } from "./types.js";

/**
 * Benefits contract: every verifier returns a typed Result and a full
 * {@link Eligibility} on success. New adapters (real 270/271) must pass unchanged.
 */
const adapters: { name: string; make: () => BenefitsVerifier }[] = [
  { name: "mock", make: () => new MockBenefitsVerifier() },
];

describe.each(adapters)("BenefitsVerifier contract: $name", ({ make }) => {
  it("returns eligibility for a valid request", async () => {
    const res = await make().verify({
      orgId: "org-1",
      payerId: "12345",
      memberId: "M2468",
      clientLabel: "Client",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(typeof res.value.active).toBe("boolean");
      expect(res.value.payerId).toBe("12345");
      expect(Array.isArray(res.value.notes)).toBe(true);
    }
  });

  it("returns a typed validation error when member/payer missing", async () => {
    const res = await make().verify({ orgId: "o", payerId: "", memberId: "", clientLabel: "C" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("validation");
  });

  it("returns a retryable payer_unavailable error for a down payer", async () => {
    const res = await make().verify({ orgId: "o", payerId: "000", memberId: "M1", clientLabel: "C" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("payer_unavailable");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("is deterministic (same input → same eligibility)", async () => {
    const a = await make().verify({ orgId: "o", payerId: "77", memberId: "M2468", clientLabel: "C" });
    const b = await make().verify({ orgId: "o", payerId: "77", memberId: "M2468", clientLabel: "C" });
    expect(a).toEqual(b);
  });
});
