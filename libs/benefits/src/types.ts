import type { Result } from "@cura/shared";

/**
 * Insurance eligibility / benefits verification behind one interface. Payer
 * portals + clearinghouses differ, so adapters (mock, real 270/271) satisfy this
 * shape + a contract test. `verify` returns a typed {@link BenefitsError} inside
 * a {@link Result} — never throws for expected failures (CONVENTIONS §3). This is
 * shared by Curadesk (front-desk verification) and Curabill (pre-claim checks).
 */

export type BenefitsErrorKind = "not_found" | "validation" | "payer_unavailable";

export interface BenefitsError {
  kind: BenefitsErrorKind;
  message: string;
  retryable: boolean;
}

export type BenefitsResult<T> = Result<T, BenefitsError>;

export interface EligibilityRequest {
  orgId: string;
  payerId: string;
  memberId: string;
  clientLabel: string;
  /** CPT/service type being checked (e.g. behavioral-health outpatient). */
  serviceType?: string;
}

export interface Eligibility {
  active: boolean;
  payerId: string;
  planName: string;
  copayCents: number;
  deductibleRemainingCents: number;
  /** True when the plan requires prior authorization for the service. */
  priorAuthRequired: boolean;
  /** Coverage notes safe to surface (no PHI beyond what the caller supplied). */
  notes: string[];
}

export interface BenefitsVerifier {
  readonly name: string;
  verify(request: EligibilityRequest): Promise<BenefitsResult<Eligibility>>;
}

export function benefitsError(
  kind: BenefitsErrorKind,
  message: string,
  retryable = kind === "payer_unavailable",
): BenefitsError {
  return { kind, message, retryable };
}
