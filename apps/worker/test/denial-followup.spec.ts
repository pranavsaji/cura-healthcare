import { describe, expect, it } from "vitest";
import { AutoApproveGate, DenyByDefaultGate, type AgentAudit, type AgentAuditEvent } from "@cura/agents";
import type { Denial } from "@cura/rcm";
import { followUpDenials } from "../src/workflows/denial-followup.js";

class RecordingAudit implements AgentAudit {
  readonly events: AgentAuditEvent[] = [];
  async record(e: AgentAuditEvent): Promise<void> {
    this.events.push(e);
  }
  has(action: string): boolean {
    return this.events.some((e) => e.action === action);
  }
}

const denials: Denial[] = [
  { claimId: "D1", carc: "197", reason: "auth absent", category: "authorization", amountCents: 15000, suggestedAction: "Obtain retro-auth", patientResponsibility: false },
  { claimId: "D2", carc: "1", reason: "Deductible", category: "other", amountCents: 3000, suggestedAction: "Bill patient", patientResponsibility: true },
];

describe("Curabill · denial-followup workflow", () => {
  it("drafts an appeal for a true denial and submits it after approval", async () => {
    const audit = new RecordingAudit();
    const res = await followUpDenials("org-1", denials, { audit, approvals: new AutoApproveGate("biller") });
    // Only the non-PR denial (D1) is appealed; D2 is patient responsibility.
    expect(res.drafts.map((d) => d.claimId)).toEqual(["D1"]);
    expect(res.submitted).toBe(1);
    expect(res.drafts[0]!.body).toMatch(/CARC 197/);
    expect(audit.has("denial.appeal.drafted")).toBe(true);
    expect(audit.has("denial.appeal.submitted")).toBe(true);
  });

  it("leaves the appeal PENDING (unsubmitted) when approval is withheld", async () => {
    const audit = new RecordingAudit();
    const res = await followUpDenials("org-1", denials, { audit, approvals: new DenyByDefaultGate("needs review") });
    expect(res.submitted).toBe(0);
    expect(res.pending).toBe(1);
    expect(res.drafts[0]!.status).toBe("pending_approval");
    expect(audit.has("denial.appeal.submitted")).toBe(false);
    expect(audit.has("denial.appeal.pending")).toBe(true);
  });
});
