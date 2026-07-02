# HIPAA Compliance Posture

_Phase 16 deliverable. Maps Cura's technical + administrative controls to the HIPAA Security Rule
(45 CFR §164.308/310/312/314). This is an engineering-facing summary, not legal advice._

## Scope
Cura is a **Business Associate**. PHI classes handled: session **audio**, **transcripts**, generated
**notes**, and **client identifiers** (display label, MRN). Marketing (`apps/marketing`) handles **no
PHI**. Every PHI-touching action is tenant-scoped (`orgId`) and audited.

## Technical safeguards (§164.312)

| Control | Requirement | How Cura meets it |
|---|---|---|
| Access control | §312(a)(1) | WorkOS SSO + RBAC (`libs/auth`), tenant isolation on every query. **Proven by `apps/api/test/authz-matrix.spec.ts`** (role × endpoint, no cross-tenant). |
| Unique user ID | §312(a)(2)(i) | Every actor is a `userId`; every audit event records actor + `orgId`. |
| Emergency access | §312(a)(2)(ii) | Break-glass owner role; all access audited. |
| Automatic logoff | §312(a)(2)(iii) | Session token TTL (`SESSION_TTL_SECONDS`); expired tokens → 401. |
| Encryption at rest | §312(a)(2)(iv) | KMS/AES-256 volume encryption + app-layer envelope encryption for PII columns (`libs/db/encryption.ts`). |
| Audit controls | §312(b) | Hash-chained, tamper-evident `audit_events` (`libs/audit`); integrity verifiable (`/audit/verify`). |
| Integrity | §312(c)(1) | Audit hash chain detects tampering; forward-only migrations. |
| Transmission security | §312(e)(1) | TLS 1.2+ everywhere; HSTS (`apps/api/src/plugins/security.ts`). |

## Administrative + physical safeguards
- **Risk analysis (§308(a)(1)):** threat model in [`data-flow-diagram.md`](./data-flow-diagram.md).
- **Workforce/access review (§308(a)(3/4)):** [`access-review.md`](./access-review.md).
- **Incident response (§308(a)(6)):** [`incident-response.md`](./incident-response.md).
- **BA contracts (§308(b)):** [`subprocessors.md`](./subprocessors.md) tracks BAAs. **No real subprocessor
  touches PHI without a signed BAA** — until then the `mock` provider is the only allowed path
  (CONVENTIONS §6).
- **Data retention/disposal:** [`retention-policy.md`](./retention-policy.md).

## Minimum-necessary logging
Loggers redact PHI + secrets by default (`libs/core/logger.ts`). **Proven by
`apps/api/test/phi-logs.spec.ts`** — a full note-generation flow emits zero PHI to logs.

## Gaps / TODO before production
- Execute BAAs with Anthropic, the ASR vendor, and the cloud provider (currently mock-only).
- Penetration test (external) + ZAP DAST in CI ([`test/security/zap-baseline.yaml`](../../test/security/zap-baseline.yaml)).
- Formal workforce HIPAA training records.
