# Access Review Procedure

_Phase 16 deliverable. HIPAA §164.308(a)(3/4) / SOC 2 CC6.1–6.3. Periodic verification that access is
minimum-necessary and promptly revoked._

## Cadence
- **Quarterly** — full review of all human access (Cura staff + per-tenant admins).
- **On change** — within 24 h of role change, offboarding, or a new subprocessor.

## What is reviewed
1. **Cura workforce** — production access (cloud console, DB, secrets vault). Principle: almost no one
   has standing PHI access; break-glass is time-boxed and audited.
2. **Per-tenant roles** — the RBAC matrix (`libs/shared/tenant.ts`): `owner`, `admin`, `clinician`,
   `frontdesk`, `biller`. Confirm each member's role is still minimum-necessary.
3. **Service accounts / provider keys** — one credential per subprocessor, least-scope, rotated.

## Evidence (automated)
- The RBAC matrix is **code**, and its enforcement is proven every CI run by
  `apps/api/test/authz-matrix.spec.ts` (role × endpoint, no privilege escalation, no cross-tenant).
- Every access to PHI is an `audit_events` row (actor + `orgId` + resource); `/audit` + `/audit/verify`
  produce the review evidence and prove the log is untampered.

## Procedure
1. Export the member/role list per org and the Cura workforce access list.
2. For each principal, confirm role ≤ job need; flag standing PHI access for justification or removal.
3. Verify all terminated users are deprovisioned (SSO + any local tokens invalidated by TTL).
4. Rotate any credential older than policy (90 days) or with unknown owner.
5. Record sign-off (reviewer, date, findings, actions) — retained ≥ 6 years.

## Offboarding checklist
- [ ] SSO account disabled (WorkOS) → all sessions expire at TTL.
- [ ] Cloud/DB/vault access revoked.
- [ ] Personal access tokens / API keys revoked.
- [ ] Review completed within 24 h; recorded as an audit event.
