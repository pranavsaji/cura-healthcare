import { describe, expect, it } from "vitest";
import { detectDenials, describeCarc, predictDenial } from "./denials.js";
import { defaultRuleSet } from "./payer-rules.js";
import { Claim, type Remittance } from "./types.js";

function claim(over: Partial<Claim> = {}): Claim {
  return Claim.parse({
    id: "C1", orgId: "org-1", payerId: "60054", memberId: "M1", npi: "1999999984",
    diagnoses: ["F411"], serviceLines: [{ cpt: "90837", chargeCents: 15000 }], serviceDate: "20260615",
    ...over,
  });
}

describe("CARC/RARC + denial detection", () => {
  it("decodes a CARC into a reason + category + action", () => {
    const info = describeCarc("197");
    expect(info.category).toBe("authorization");
    expect(info.action).toMatch(/auth/i);
  });

  it("detects a denial on an 835 but ignores a contractual write-off on a paid claim", () => {
    const rem: Remittance = {
      orgId: "org-1", payerId: "60054", paymentCents: 18000, checkOrEftNumber: "E1",
      lines: [
        { claimId: "P1", chargeCents: 27000, paidCents: 18000, statusCode: "1", adjustments: [{ group: "CO", carc: "45", amountCents: 9000 }] },
        { claimId: "D1", chargeCents: 15000, paidCents: 0, statusCode: "4", adjustments: [{ group: "CO", carc: "197", amountCents: 15000 }] },
      ],
    };
    const denials = detectDenials(rem);
    expect(denials.map((d) => d.claimId)).toEqual(["D1"]);
    expect(denials[0]!.carc).toBe("197");
    expect(denials[0]!.category).toBe("authorization");
  });
});

describe("denial prediction", () => {
  const rules = defaultRuleSet("60054");

  it("predicts a high likelihood when a blocking rule fires (missing auth)", () => {
    const p = predictDenial(claim(), rules);
    expect(p.likelihood).toBeGreaterThanOrEqual(0.8);
    expect(p.topCarc).toBe("197");
  });

  it("predicts low for a clean claim with no rule findings", () => {
    // Prior auth + referring provider present → no blocking rule.
    const clean = claim({ priorAuthNumber: "A", referringProviderNpi: "1999999984" });
    const p = predictDenial(clean, rules);
    expect(p.likelihood).toBeLessThan(0.2);
  });
});
