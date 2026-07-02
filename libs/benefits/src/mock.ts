import { ok, err } from "@cura/shared";
import {
  type BenefitsResult,
  type BenefitsVerifier,
  type Eligibility,
  type EligibilityRequest,
  benefitsError,
} from "./types.js";

/**
 * Deterministic {@link BenefitsVerifier} for offline dev/tests. Derives a stable
 * plan from the inputs (no network, no randomness) so tests assert exact values.
 * A member id ending in an even digit is "active"; `payerId` "000" simulates an
 * unavailable payer. A real 270/271 adapter satisfies the same contract.
 */
export class MockBenefitsVerifier implements BenefitsVerifier {
  readonly name = "mock";

  async verify(request: EligibilityRequest): Promise<BenefitsResult<Eligibility>> {
    if (!request.memberId || !request.payerId) {
      return err(benefitsError("validation", "memberId and payerId are required"));
    }
    if (request.payerId === "000") {
      return err(benefitsError("payer_unavailable", "payer portal unavailable"));
    }
    const lastDigit = Number(request.memberId.replace(/\D/g, "").slice(-1) || "1");
    const active = lastDigit % 2 === 0;
    const priorAuthRequired = lastDigit % 3 === 0;
    const eligibility: Eligibility = {
      active,
      payerId: request.payerId,
      planName: `Plan-${request.payerId}`,
      copayCents: active ? 2500 : 0,
      deductibleRemainingCents: active ? 15000 : 0,
      priorAuthRequired,
      notes: active
        ? priorAuthRequired
          ? ["Coverage active", "Prior authorization required for this service"]
          : ["Coverage active"]
        : ["Coverage inactive or member not found"],
    };
    return ok(eligibility);
  }
}
