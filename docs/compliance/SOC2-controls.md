# SOC 2 Type II — Control Mapping

_Phase 16 deliverable. Maps the Trust Services Criteria (TSC) to implemented, testable controls.
"Evidence" points to code/tests that demonstrate the control operating._

## Security (Common Criteria)

| CC | Control | Evidence |
|---|---|---|
| CC6.1 | Logical access — RBAC + least privilege | `libs/auth/rbac.ts`; `apps/api/test/authz-matrix.spec.ts` |
| CC6.1 | Tenant isolation (no cross-org access) | `MemoryStoreFactory`/`PostgresStore` scope by `orgId`; authz-matrix cross-tenant test |
| CC6.6 | Network security headers, CORS lockdown, CSRF | `apps/api/src/plugins/security.ts`; `security-headers.spec.ts` |
| CC6.7 | Encryption in transit + at rest | TLS/HSTS; KMS + envelope encryption (`libs/db/encryption.ts`) |
| CC6.8 | Malicious input handling | zod validation at every boundary; `fuzz.spec.ts` (never 5xx / leak) |
| CC7.1 | Vulnerability management (SCA) | `pnpm audit` gate — `test/security/dependency-audit.spec.ts` |
| CC7.2 | Anomaly detection / audit logging | hash-chained `audit_events` (`libs/audit`); telemetry (`libs/telemetry`) |
| CC7.3 | Incident response | [`incident-response.md`](./incident-response.md) |
| CC7.4 | Resiliency / recovery | chaos suite `test/chaos/*` (replica kill, provider timeout, graceful shutdown) |
| CC8.1 | Change management | trunk-based, `pnpm verify` gate, forward-only migrations, [`../RELEASE.md`](../RELEASE.md) |

## Availability
- **A1.1 capacity/NFRs:** load gate `test/load/nfr.spec.ts` + k6 scripts; NFRs partials <1.5s, note <60s.
- **A1.2 backups/DR:** [`../../infra/README.md`](../../infra/README.md) (automated PG backups, PITR, restore drills).
- **A1.3 recovery testing:** chaos suite + quarterly restore drill (runbook).

## Confidentiality
- **C1.1 PHI classification + handling:** [`data-flow-diagram.md`](./data-flow-diagram.md).
- **C1.2 disposal:** [`retention-policy.md`](./retention-policy.md) — auditable hard-delete.

## Processing Integrity
- Idempotent, retried, **human-gated** side effects (EHR sync Phase 13; billing Phase 18).
- Evidence-linked notes with traceable generation (`libs/notes`), full audit replay.

## Continuous monitoring
`pnpm verify` (typecheck + lint + unit) on every PR; `test:security`, `test:load`, `test:chaos`, and
`test:int` (Testcontainers) as CI jobs. Access reviews quarterly ([`access-review.md`](./access-review.md)).
