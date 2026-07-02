import type { AgentAudit } from "@cura/agents";
import {
  type Denial,
  type InMemoryLearningStore,
  type Remittance,
  detectDenials,
} from "@cura/rcm";

/**
 * Payment-posting workflow (Phase 18): parse an 835 (done upstream), post each
 * claim's payment, surface denials, and feed the **learning loop** with the
 * outcome so future predictions sharpen. Idempotent by check/EFT number so a
 * re-delivered ERA is never double-posted. Fully audited, tenant-scoped.
 */
export interface PaymentPostingDeps {
  audit: AgentAudit;
  /** The learning store to update with accept/deny outcomes. */
  learning?: InMemoryLearningStore;
  /** Resolve the CPT codes for a claim (to attribute learning). */
  cptsFor?: (claimId: string) => string[];
  /** Idempotency ledger of already-posted check/EFT numbers. */
  posted?: Set<string>;
}

export interface PostingResult {
  posted: boolean;
  totalPaidCents: number;
  claimsPosted: number;
  denials: Denial[];
}

export async function postPayment(rem: Remittance, deps: PaymentPostingDeps): Promise<PostingResult> {
  const posted = deps.posted ?? new Set<string>();
  const audit = (action: string, context: Record<string, unknown> = {}) =>
    deps.audit.record({ orgId: rem.orgId, action, resource: `remittance:${rem.checkOrEftNumber}`, context });

  // Idempotency: never post the same ERA twice.
  if (posted.has(rem.checkOrEftNumber)) {
    await audit("payment.post.idempotent_hit");
    return { posted: false, totalPaidCents: 0, claimsPosted: 0, denials: [] };
  }

  const denials = detectDenials(rem);
  for (const line of rem.lines) {
    await audit("payment.posted", { claimId: line.claimId, paidCents: line.paidCents, statusCode: line.statusCode });

    // Feed the learning loop: was this claim denied?
    if (deps.learning && deps.cptsFor) {
      const denied = line.statusCode === "4" || line.paidCents === 0;
      const carc = line.adjustments.find((a) => a.group !== "PR")?.carc;
      deps.learning.record({
        orgId: rem.orgId,
        payerId: rem.payerId,
        cpts: deps.cptsFor(line.claimId),
        denied,
        ...(carc ? { carc } : {}),
      });
    }
  }

  posted.add(rem.checkOrEftNumber);
  await audit("payment.post.completed", { claims: rem.lines.length, denials: denials.length });
  return {
    posted: true,
    totalPaidCents: rem.paymentCents,
    claimsPosted: rem.lines.length,
    denials,
  };
}
