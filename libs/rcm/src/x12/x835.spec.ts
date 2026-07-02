import { describe, expect, it } from "vitest";
import type { Remittance } from "../types.js";
import { build835, parse835 } from "./x835.js";

const remittance: Remittance = {
  orgId: "org-1",
  payerId: "60054",
  payerName: "AETNA",
  paymentCents: 18000,
  checkOrEftNumber: "EFT-9001",
  lines: [
    // A paid claim with a contractual write-off.
    {
      claimId: "CLM1001",
      chargeCents: 27000,
      paidCents: 18000,
      statusCode: "1",
      adjustments: [{ group: "CO", carc: "45", amountCents: 9000 }],
    },
    // A denied claim (auth absent).
    {
      claimId: "CLM1002",
      chargeCents: 15000,
      paidCents: 0,
      statusCode: "4",
      adjustments: [{ group: "CO", carc: "197", amountCents: 15000, rarc: ["N130"] }],
    },
  ],
};

describe("X12 835 build/parse round-trip", () => {
  it("parses BPR payment + TRN + per-claim CLP lines", () => {
    const era = build835(remittance, { controlNumber: "000000200" });
    const parsed = parse835(era, "org-1");
    expect(parsed.paymentCents).toBe(18000);
    expect(parsed.checkOrEftNumber).toBe("EFT-9001");
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]!.claimId).toBe("CLM1001");
    expect(parsed.lines[0]!.paidCents).toBe(18000);
  });

  it("parses CAS adjustments with CARC (and RARC) codes", () => {
    const era = build835(remittance);
    const parsed = parse835(era, "org-1");
    const denied = parsed.lines.find((l) => l.claimId === "CLM1002")!;
    expect(denied.statusCode).toBe("4");
    expect(denied.adjustments[0]!.carc).toBe("197");
    expect(denied.adjustments[0]!.amountCents).toBe(15000);
    expect(denied.adjustments[0]!.rarc).toContain("N130");
  });

  it("is tenant-scoped by the orgId passed to parse", () => {
    const era = build835(remittance);
    expect(parse835(era, "org-99").orgId).toBe("org-99");
  });
});
