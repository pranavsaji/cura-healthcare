import { describe, expect, it } from "vitest";
import { AutoApproveGate, DenyByDefaultGate, type AgentAudit, type AgentAuditEvent } from "@cura/agents";
import { Claim, MockClearinghouse, defaultRuleSet } from "@cura/rcm";
import { InMemorySubmissionStore, submitClaim, type ClaimSubmitDeps } from "../src/workflows/claim-submit.js";

class RecordingAudit implements AgentAudit {
  readonly events: AgentAuditEvent[] = [];
  async record(e: AgentAuditEvent): Promise<void> {
    this.events.push(e);
  }
  has(action: string): boolean {
    return this.events.some((e) => e.action === action);
  }
}

function cleanClaim(over: Partial<Claim> = {}): Claim {
  // Prior auth + referring provider present → no blocking pre-denial rule.
  return Claim.parse({
    id: "CLM1", orgId: "org-1", payerId: "60054", memberId: "M1", npi: "1999999984",
    diagnoses: ["F411"], serviceLines: [{ cpt: "90837", chargeCents: 15000 }],
    serviceDate: "20260615", priorAuthNumber: "AUTH-1", referringProviderNpi: "1999999984",
    ...over,
  });
}

function deps(over: Partial<ClaimSubmitDeps> = {}): { audit: RecordingAudit; ch: MockClearinghouse; d: ClaimSubmitDeps } {
  const audit = new RecordingAudit();
  const ch = new MockClearinghouse();
  const d: ClaimSubmitDeps = {
    clearinghouse: ch,
    ruleSet: defaultRuleSet("60054"),
    approvals: new AutoApproveGate("biller-lead"),
    audit,
    submissions: new InMemorySubmissionStore(),
    sleep: async () => {},
    ...over,
  };
  return { audit, ch, d };
}

describe("Curabill · claim-submit workflow", () => {
  it("submits an approved, clean claim and audits every step", async () => {
    const { audit, ch, d } = deps();
    const res = await submitClaim(cleanClaim(), d);
    expect(res.status).toBe("submitted");
    expect(res.ack?.traceNumber).toMatch(/TRACE-/);
    expect(audit.has("claim.submit.approved")).toBe(true);
    expect(audit.has("claim.submitted")).toBe(true);
    // Actually reached the clearinghouse.
    expect((await ch.track("CLM1")).ok).toBe(true);
  });

  it("NEVER submits without a recorded human approval (HITL gate)", async () => {
    const { audit, ch, d } = deps({ approvals: new DenyByDefaultGate("no approver") });
    const res = await submitClaim(cleanClaim(), d);
    expect(res.status).toBe("rejected_by_human");
    expect(audit.has("claim.submit.denied")).toBe(true);
    expect(audit.has("claim.submitted")).toBe(false);
    // The claim was never sent to the clearinghouse.
    const track = await ch.track("CLM1");
    expect(track.ok).toBe(false);
  });

  it("HALTS on a pre-denial finding (missing auth) before submission", async () => {
    const { audit, ch, d } = deps();
    const res = await submitClaim(cleanClaim({ priorAuthNumber: undefined }), d);
    expect(res.status).toBe("needs_correction");
    expect(res.findings?.some((f) => f.carc === "197")).toBe(true);
    // Not submitted (caught the issue before it became a denial).
    expect(audit.has("claim.submitted")).toBe(false);
    expect((await ch.track("CLM1")).ok).toBe(false);
  });

  it("is idempotent: re-running a submitted claim returns the same ack, no 2nd approval", async () => {
    const { audit, d } = deps();
    const first = await submitClaim(cleanClaim(), d);
    const second = await submitClaim(cleanClaim(), d);
    expect(second.status).toBe("submitted");
    expect(second.ack?.traceNumber).toBe(first.ack?.traceNumber);
    // Only ONE approval recorded across both runs.
    expect(audit.events.filter((e) => e.action === "claim.submit.approved")).toHaveLength(1);
    expect(audit.has("claim.submit.idempotent_hit")).toBe(true);
  });

  it("retries a transient clearinghouse failure then succeeds", async () => {
    // A clearinghouse that fails with a retryable error twice, then accepts.
    let calls = 0;
    const flaky = new MockClearinghouse();
    const realSubmit = flaky.submit.bind(flaky);
    flaky.submit = async (claimId, edi, key) => {
      calls += 1;
      if (calls < 3) return { ok: false, error: { kind: "unavailable", message: "503", retryable: true } };
      return realSubmit(claimId, edi, key);
    };
    const { d } = deps({ clearinghouse: flaky, retryAttempts: 5 });
    const res = await submitClaim(cleanClaim(), d);
    expect(res.status).toBe("submitted");
    expect(calls).toBe(3);
  });
});
