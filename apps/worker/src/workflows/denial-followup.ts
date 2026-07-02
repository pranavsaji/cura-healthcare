import type { AgentAudit, ApprovalGate } from "@cura/agents";
import { type Denial, describeCarc } from "@cura/rcm";

/**
 * Denial-followup workflow (Phase 18): for each true denial, draft an appeal /
 * follow-up (from the CARC's decoded reason + next-best-action) and **gate the
 * actual appeal submission behind a human approval** — the same HITL + audit
 * primitives the agent runtime uses. Patient-responsibility (PR) adjustments are
 * NOT appealed (they're billed to the patient). Tenant-scoped + fully audited.
 */
export interface DenialFollowupDeps {
  audit: AgentAudit;
  approvals: ApprovalGate;
}

export interface AppealDraft {
  claimId: string;
  carc: string;
  body: string;
  status: "submitted" | "pending_approval";
}

export interface FollowupResult {
  drafts: AppealDraft[];
  submitted: number;
  pending: number;
}

export async function followUpDenials(
  orgId: string,
  denials: Denial[],
  deps: DenialFollowupDeps,
): Promise<FollowupResult> {
  const drafts: AppealDraft[] = [];
  for (const denial of denials) {
    if (denial.patientResponsibility) continue; // bill the patient, don't appeal

    const info = describeCarc(denial.carc);
    const body = draftAppeal(denial.claimId, denial.carc, info.reason, info.action);
    await deps.audit.record({
      orgId,
      action: "denial.appeal.drafted",
      resource: `claim:${denial.claimId}`,
      context: { carc: denial.carc, category: denial.category },
    });

    // Submitting an appeal is a side effect → HITL-gated.
    const approval = await deps.approvals.requestApproval({
      orgId,
      tool: "submit_appeal",
      summary: `Appeal claim ${denial.claimId} (CARC ${denial.carc}: ${info.reason})`,
      input: { claimId: denial.claimId, carc: denial.carc },
    });
    if (approval.approved) {
      await deps.audit.record({ orgId, action: "denial.appeal.submitted", resource: `claim:${denial.claimId}`, context: { approver: approval.approver } });
      drafts.push({ claimId: denial.claimId, carc: denial.carc, body, status: "submitted" });
    } else {
      await deps.audit.record({ orgId, action: "denial.appeal.pending", resource: `claim:${denial.claimId}`, context: { reason: approval.reason } });
      drafts.push({ claimId: denial.claimId, carc: denial.carc, body, status: "pending_approval" });
    }
  }
  return {
    drafts,
    submitted: drafts.filter((d) => d.status === "submitted").length,
    pending: drafts.filter((d) => d.status === "pending_approval").length,
  };
}

function draftAppeal(claimId: string, carc: string, reason: string, action: string): string {
  return [
    `Re: Appeal for claim ${claimId}`,
    ``,
    `This claim was adjusted under CARC ${carc} (${reason}).`,
    `Requested resolution: ${action}`,
    `Please reprocess the claim. Supporting documentation is attached.`,
  ].join("\n");
}
