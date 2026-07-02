import { describe, expect, it } from "vitest";
import { type AgentAudit, type AgentAuditEvent } from "@cura/agents";
import { InMemoryLearningStore, predictDenial, defaultRuleSet, Claim, type Remittance } from "@cura/rcm";
import { postPayment } from "../src/workflows/payment-posting.js";

class RecordingAudit implements AgentAudit {
  readonly events: AgentAuditEvent[] = [];
  async record(e: AgentAuditEvent): Promise<void> {
    this.events.push(e);
  }
}

const remittance: Remittance = {
  orgId: "org-1",
  payerId: "60054",
  paymentCents: 18000,
  checkOrEftNumber: "EFT-1",
  lines: [
    { claimId: "P1", chargeCents: 27000, paidCents: 18000, statusCode: "1", adjustments: [{ group: "CO", carc: "45", amountCents: 9000 }] },
    { claimId: "D1", chargeCents: 15000, paidCents: 0, statusCode: "4", adjustments: [{ group: "CO", carc: "197", amountCents: 15000 }] },
  ],
};

describe("Curabill · payment-posting workflow", () => {
  it("posts each claim, surfaces denials, and audits the run", async () => {
    const audit = new RecordingAudit();
    const res = await postPayment(remittance, { audit });
    expect(res.posted).toBe(true);
    expect(res.claimsPosted).toBe(2);
    expect(res.totalPaidCents).toBe(18000);
    expect(res.denials.map((d) => d.claimId)).toEqual(["D1"]);
    expect(audit.events.some((e) => e.action === "payment.post.completed")).toBe(true);
  });

  it("is idempotent by check/EFT number (never double-posts)", async () => {
    const audit = new RecordingAudit();
    const posted = new Set<string>();
    const first = await postPayment(remittance, { audit, posted });
    const second = await postPayment(remittance, { audit, posted });
    expect(first.posted).toBe(true);
    expect(second.posted).toBe(false);
    expect(audit.events.some((e) => e.action === "payment.post.idempotent_hit")).toBe(true);
  });

  it("feeds the learning loop so a future prediction MOVES after posting a denial", async () => {
    const audit = new RecordingAudit();
    const learning = new InMemoryLearningStore();
    const cptsFor = (claimId: string) => (claimId === "D1" ? ["90837"] : ["90834"]);

    // A clean claim (no rule fires) → baseline prediction 0.
    const clean = Claim.parse({
      id: "X", orgId: "org-1", payerId: "60054", memberId: "M1", npi: "1999999984",
      diagnoses: ["F411"], serviceLines: [{ cpt: "90837", chargeCents: 15000 }],
      serviceDate: "20260615", priorAuthNumber: "A", referringProviderNpi: "1999999984",
    });
    const rules = defaultRuleSet("60054");
    expect(predictDenial(clean, rules, learning.forOrg("org-1")).likelihood).toBe(0);

    await postPayment(remittance, { audit, learning, cptsFor });

    // After posting D1's denial (90837, CARC 197), the prediction for that
    // payer/procedure has moved up.
    const after = predictDenial(clean, rules, learning.forOrg("org-1"));
    expect(after.likelihood).toBeGreaterThan(0);
    expect(after.topCarc).toBe("197");
  });
});
