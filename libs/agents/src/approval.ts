import type { ApprovalDecision, ApprovalGate, ApprovalRequest } from "./types.js";

/**
 * Approval gates for side-effectful tools. The default posture is **deny** — a
 * side effect only happens with an explicit, recorded approval (CONVENTIONS §6).
 */

/** Blocks every side effect. Safe default when no approver is wired. */
export class DenyByDefaultGate implements ApprovalGate {
  constructor(private readonly reason = "No approver configured") {}
  async requestApproval(_request?: ApprovalRequest): Promise<ApprovalDecision> {
    return { approved: false, reason: this.reason };
  }
}

/**
 * Auto-approves — ONLY for tests/demos where a human approval is simulated.
 * Records who "approved" so the audit trail is still complete.
 */
export class AutoApproveGate implements ApprovalGate {
  constructor(private readonly approver = "auto-approver") {}
  async requestApproval(_request?: ApprovalRequest): Promise<ApprovalDecision> {
    return { approved: true, approver: this.approver };
  }
}

/**
 * A queue-backed gate: side effects park as pending approvals a human resolves
 * out of band (the front-desk/billing UI). Deterministic + inspectable for tests.
 */
export class QueuedApprovalGate implements ApprovalGate {
  private readonly pending: (ApprovalRequest & { resolve: (d: ApprovalDecision) => void })[] = [];

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      this.pending.push({ ...request, resolve });
    });
  }

  /** Number of side effects currently awaiting a human. */
  get size(): number {
    return this.pending.length;
  }

  /** List pending requests (non-PHI summaries) for the approver UI. */
  list(): ApprovalRequest[] {
    return this.pending.map(({ resolve: _resolve, ...r }) => r);
  }

  /** Approve the oldest pending request. */
  approveNext(approver: string): void {
    const next = this.pending.shift();
    next?.resolve({ approved: true, approver });
  }

  /** Reject the oldest pending request. */
  rejectNext(reason: string): void {
    const next = this.pending.shift();
    next?.resolve({ approved: false, reason });
  }
}
