import { withRetry } from "@cura/core";
import type { AgentAudit, ApprovalGate } from "@cura/agents";
import {
  type Claim,
  type Clearinghouse,
  type ClearinghouseError,
  type ClearinghouseResult,
  type PayerRuleSet,
  type PreDenialFinding,
  type SubmitAck,
  build837,
  evaluateClaim,
  validate837,
} from "@cura/rcm";

/**
 * The claim-submission workflow (Phase 18) — durable, idempotent, **human-gated**,
 * and fully audited. The pipeline is deliberately fail-closed:
 *   build 837 → validate → PRE-DENIAL rules check (catch issues before submitting)
 *   → require a recorded human APPROVAL → submit (retried) → audit.
 * **No claim is submitted without an approval**, and a blocking pre-denial finding
 * halts submission so the biller can fix it first. Idempotent by claim id: a retry
 * of an already-submitted claim returns the prior ack without re-approving.
 */
export type ClaimSubmitStatus =
  | "invalid" // 837 failed structural validation
  | "needs_correction" // pre-denial rule(s) would bounce it — not submitted
  | "rejected_by_human" // approval denied — not submitted
  | "submitted"; // approved + accepted by the clearinghouse

export interface ClaimSubmitResult {
  status: ClaimSubmitStatus;
  claimId: string;
  findings?: PreDenialFinding[];
  issues?: { code: string; message: string }[];
  ack?: SubmitAck;
  denialReason?: string;
}

/** Idempotency ledger: remembers claims already submitted (so retries are safe). */
export interface SubmissionStore {
  get(claimId: string): Promise<SubmitAck | undefined>;
  put(claimId: string, ack: SubmitAck): Promise<void>;
}

export class InMemorySubmissionStore implements SubmissionStore {
  private readonly acks = new Map<string, SubmitAck>();
  async get(claimId: string): Promise<SubmitAck | undefined> {
    return this.acks.get(claimId);
  }
  async put(claimId: string, ack: SubmitAck): Promise<void> {
    this.acks.set(claimId, ack);
  }
}

export interface ClaimSubmitDeps {
  clearinghouse: Clearinghouse;
  ruleSet: PayerRuleSet;
  approvals: ApprovalGate;
  audit: AgentAudit;
  submissions?: SubmissionStore;
  retryAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Today (YYYYMMDD) for timely-filing checks. */
  today?: string;
}

export async function submitClaim(claim: Claim, deps: ClaimSubmitDeps): Promise<ClaimSubmitResult> {
  const submissions = deps.submissions ?? new InMemorySubmissionStore();
  const audit = (action: string, context: Record<string, unknown> = {}) =>
    deps.audit.record({ orgId: claim.orgId, action, resource: `claim:${claim.id}`, context });

  // Idempotency: already submitted → return the prior ack, no re-approval.
  const prior = await submissions.get(claim.id);
  if (prior) {
    await audit("claim.submit.idempotent_hit", { traceNumber: prior.traceNumber });
    return { status: "submitted", claimId: claim.id, ack: prior };
  }

  await audit("claim.build.started");
  const edi = build837(claim);
  const validation = validate837(edi);
  if (!validation.valid) {
    await audit("claim.build.invalid", { issues: validation.issues.map((i) => i.code) });
    return { status: "invalid", claimId: claim.id, issues: validation.issues };
  }

  // Pre-denial gate: catch issues BEFORE they become denials.
  const findings = evaluateClaim(claim, deps.ruleSet, deps.today ? { today: deps.today } : {});
  const blocking = findings.filter((f) => f.severity === "block");
  await audit("claim.rules.evaluated", { findings: findings.length, blocking: blocking.length });
  if (blocking.length > 0) {
    await audit("claim.needs_correction", { carcs: blocking.map((f) => f.carc) });
    return { status: "needs_correction", claimId: claim.id, findings };
  }

  // HUMAN GATE: no money-moving submission without a recorded approval.
  const approval = await deps.approvals.requestApproval({
    orgId: claim.orgId,
    tool: "submit_claim",
    summary: `Submit claim ${claim.id} to payer ${claim.payerId} for $${(totalDollars(claim))}`,
    input: { claimId: claim.id, payerId: claim.payerId },
  });
  if (!approval.approved) {
    await audit("claim.submit.denied", { reason: approval.reason });
    return { status: "rejected_by_human", claimId: claim.id, denialReason: approval.reason };
  }
  await audit("claim.submit.approved", { approver: approval.approver });

  // Submit with retry on transient clearinghouse failures.
  const result = await submitWithRetry(deps, claim.id, edi);
  if (!result.ok) {
    await audit("claim.submit.failed", { kind: result.error.kind });
    return { status: "invalid", claimId: claim.id, issues: [{ code: result.error.kind, message: result.error.message }] };
  }
  await submissions.put(claim.id, result.value);
  await audit("claim.submitted", { traceNumber: result.value.traceNumber });
  return { status: "submitted", claimId: claim.id, ack: result.value };
}

async function submitWithRetry(
  deps: ClaimSubmitDeps,
  claimId: string,
  edi: string,
): Promise<ClearinghouseResult<SubmitAck>> {
  try {
    return await withRetry(
      async () => {
        const res = await deps.clearinghouse.submit(claimId, edi, `submit:${claimId}`);
        // Only transient failures are retried (throw to trigger the next attempt).
        if (!res.ok && res.error.retryable) throw res.error;
        return res;
      },
      {
        attempts: deps.retryAttempts ?? 3,
        retryable: () => true,
        ...(deps.sleep ? { sleep: deps.sleep } : {}),
      },
    );
  } catch (e) {
    return { ok: false, error: e as ClearinghouseError };
  }
}

function totalDollars(claim: Claim): string {
  return (claim.serviceLines.reduce((s, l) => s + l.chargeCents, 0) / 100).toFixed(2);
}
