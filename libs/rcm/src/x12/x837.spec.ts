import { describe, expect, it } from "vitest";
import { Claim } from "../types.js";
import { build837, parse837, validate837 } from "./x837.js";

const claim = Claim.parse({
  id: "CLM1001",
  orgId: "org-1",
  payerId: "60054",
  payerName: "AETNA",
  memberId: "W123456789",
  npi: "1999999984",
  providerName: "CURA CLINIC",
  diagnoses: ["F411", "F332"],
  serviceLines: [
    { cpt: "90837", chargeCents: 15000, units: 1, placeOfService: "11", modifiers: ["95"] },
    { cpt: "90847", chargeCents: 12000, units: 1, placeOfService: "11" },
  ],
  serviceDate: "20260615",
  priorAuthNumber: "AUTH-42",
});

describe("X12 837 build/validate/round-trip", () => {
  it("builds an 837 that validates against structural + envelope checks", () => {
    const edi = build837(claim, { controlNumber: "000000123" });
    const { valid, issues } = validate837(edi);
    expect(issues).toEqual([]);
    expect(valid).toBe(true);
    // Sanity: real envelope + transaction segments present.
    expect(edi).toContain("ISA*");
    expect(edi).toContain("ST*837*");
    expect(edi).toContain("CLM*CLM1001*");
  });

  it("round-trips: parse(build(claim)) recovers the key fields", () => {
    const edi = build837(claim);
    const parsed = parse837(edi);
    expect(parsed.claimId).toBe("CLM1001");
    expect(parsed.payerId).toBe("60054");
    expect(parsed.memberId).toBe("W123456789");
    expect(parsed.npi).toBe("1999999984");
    expect(parsed.diagnoses).toEqual(["F411", "F332"]);
    expect(parsed.totalChargeCents).toBe(27000);
    expect(parsed.serviceLines).toEqual([
      { cpt: "90837", modifiers: ["95"], chargeCents: 15000, units: 1 },
      { cpt: "90847", modifiers: [], chargeCents: 12000, units: 1 },
    ]);
  });

  it("catches a tampered SE segment count", () => {
    const edi = build837(claim);
    // Delete a segment to break the SE count without fixing SE01.
    const broken = edi.replace(/DTP\*472\*D8\*\d+~/, "");
    const { valid, issues } = validate837(broken);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.code === "se_count")).toBe(true);
  });

  it("catches a control-number mismatch (ISA/IEA)", () => {
    const edi = build837(claim, { controlNumber: "000000123" });
    const broken = edi.replace("IEA*1*000000123", "IEA*1*000000999");
    const { issues } = validate837(broken);
    expect(issues.some((i) => i.code === "control_isa")).toBe(true);
  });

  it("catches an unbalanced claim (CLM total ≠ line sum)", () => {
    const edi = build837(claim).replace("CLM*CLM1001*270.00", "CLM*CLM1001*999.00");
    const { issues } = validate837(edi);
    expect(issues.some((i) => i.code === "balance")).toBe(true);
  });
});
