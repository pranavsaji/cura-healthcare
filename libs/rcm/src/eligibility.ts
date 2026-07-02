import type { BenefitsResult, BenefitsVerifier, Eligibility, EligibilityRequest } from "@cura/benefits";

/**
 * 270/271 eligibility for RCM. Rather than fork a second eligibility stack, this
 * reuses the shared `@cura/benefits` verifier (same interface Curadesk uses), and
 * records the check so pre-claim eligibility is auditable. `EligibilityChecker`
 * is the thin RCM-facing service; swap the underlying verifier (mock ↔ real
 * 270/271) with no caller change.
 */
export interface EligibilityCheckRecord {
  orgId: string;
  payerId: string;
  memberId: string;
  active: boolean;
  priorAuthRequired: boolean;
  checkedAt: string;
}

export class EligibilityChecker {
  private readonly records: EligibilityCheckRecord[] = [];

  constructor(
    private readonly verifier: BenefitsVerifier,
    private readonly now: () => string = () => "1970-01-01T00:00:00.000Z",
  ) {}

  async check(request: EligibilityRequest): Promise<BenefitsResult<Eligibility>> {
    const res = await this.verifier.verify(request);
    if (res.ok) {
      this.records.push({
        orgId: request.orgId,
        payerId: request.payerId,
        memberId: request.memberId,
        active: res.value.active,
        priorAuthRequired: res.value.priorAuthRequired,
        checkedAt: this.now(),
      });
    }
    return res;
  }

  /** Tenant-scoped history of eligibility checks (for the eligibility_checks read model). */
  history(orgId: string): EligibilityCheckRecord[] {
    return this.records.filter((r) => r.orgId === orgId);
  }
}
