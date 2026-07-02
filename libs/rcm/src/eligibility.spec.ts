import { describe, expect, it } from "vitest";
import { MockBenefitsVerifier } from "@cura/benefits";
import { EligibilityChecker } from "./eligibility.js";

describe("EligibilityChecker (270/271 via @cura/benefits)", () => {
  it("verifies eligibility and records a tenant-scoped check", async () => {
    const checker = new EligibilityChecker(new MockBenefitsVerifier(), () => "2026-07-02T00:00:00.000Z");
    const res = await checker.check({ orgId: "org-1", payerId: "60054", memberId: "M2468", clientLabel: "C" });
    expect(res.ok).toBe(true);

    const history = checker.history("org-1");
    expect(history).toHaveLength(1);
    expect(history[0]!.payerId).toBe("60054");
    // Another org sees none of org-1's checks.
    expect(checker.history("org-2")).toHaveLength(0);
  });

  it("does not record a failed check", async () => {
    const checker = new EligibilityChecker(new MockBenefitsVerifier());
    await checker.check({ orgId: "org-1", payerId: "000", memberId: "M1", clientLabel: "C" }); // payer down
    expect(checker.history("org-1")).toHaveLength(0);
  });
});
