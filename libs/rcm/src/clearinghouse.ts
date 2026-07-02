import { type Result, err, ok } from "@cura/shared";

/**
 * Clearinghouse submission behind one interface (like EHR/telephony). Adapters
 * (mock, Availity, Change Healthcare) all satisfy this + a contract test. Submit
 * takes an 837 EDI string + an idempotency key so a retried submission never
 * double-files; results are typed {@link ClearinghouseError} inside a
 * {@link Result} — never throw for expected failures (CONVENTIONS §3).
 */
export type ClearinghouseErrorKind = "rejected" | "auth" | "unavailable" | "not_found";

export interface ClearinghouseError {
  kind: ClearinghouseErrorKind;
  message: string;
  retryable: boolean;
}

export type ClearinghouseResult<T> = Result<T, ClearinghouseError>;

export interface SubmitAck {
  /** Clearinghouse trace/control number for the accepted interchange. */
  traceNumber: string;
  claimId: string;
  status: "accepted";
}

export type ClaimTrackStatus = "received" | "accepted" | "rejected" | "paid" | "denied";

export interface Clearinghouse {
  readonly name: string;
  submit(claimId: string, edi837: string, idempotencyKey: string): Promise<ClearinghouseResult<SubmitAck>>;
  track(claimId: string): Promise<ClearinghouseResult<ClaimTrackStatus>>;
}

/**
 * Deterministic mock clearinghouse. Accepts well-formed 837s (must contain an ST
 * 837 + CLM), rejects otherwise, and is idempotent by key. A `rejectClaimIds`
 * set lets tests force a front-end rejection.
 */
export class MockClearinghouse implements Clearinghouse {
  readonly name = "mock";
  private readonly acks = new Map<string, SubmitAck>(); // idempotencyKey → ack
  private readonly status = new Map<string, ClaimTrackStatus>(); // claimId → status
  private seq = 0;

  constructor(private readonly rejectClaimIds = new Set<string>()) {}

  async submit(claimId: string, edi837: string, idempotencyKey: string): Promise<ClearinghouseResult<SubmitAck>> {
    const existing = this.acks.get(idempotencyKey);
    if (existing) return ok(existing);

    if (!edi837.includes("ST*837") || !edi837.includes("CLM*")) {
      return err({ kind: "rejected", message: "malformed 837 (missing ST/CLM)", retryable: false });
    }
    if (this.rejectClaimIds.has(claimId)) {
      this.status.set(claimId, "rejected");
      return err({ kind: "rejected", message: `payer front-end rejected claim ${claimId}`, retryable: false });
    }
    this.seq += 1;
    const ack: SubmitAck = { traceNumber: `TRACE-${this.seq}`, claimId, status: "accepted" };
    this.acks.set(idempotencyKey, ack);
    this.status.set(claimId, "accepted");
    return ok(ack);
  }

  async track(claimId: string): Promise<ClearinghouseResult<ClaimTrackStatus>> {
    const s = this.status.get(claimId);
    if (!s) return err({ kind: "not_found", message: `claim ${claimId} not found`, retryable: false });
    return ok(s);
  }

  /** Test/adapter helper: advance a claim's tracked status (e.g. to paid/denied). */
  setStatus(claimId: string, status: ClaimTrackStatus): void {
    this.status.set(claimId, status);
  }
}
