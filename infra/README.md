# Infrastructure & Security Controls

_Phase 16 deliverable. The production infrastructure controls that sit **outside** the application
code: secrets, KMS, backups, WAF/rate-limiting, and TLS. Controls are cross-cutting and uniform, not
per-feature (CONVENTIONS §2). This directory documents the intended posture and provides example
config; the live IaC lives in the ops repo._

## Secrets management
- **Never** `.env` in prod. Secrets come from a manager (AWS Secrets Manager / Vault) injected at boot;
  `libs/core/config.ts` validates all required env at startup and refuses to boot if any is missing.
- Rotation: session/encryption keys, provider keys, and DB creds rotate on a schedule and on incident
  (see [`../docs/compliance/incident-response.md`](../docs/compliance/incident-response.md)).
- Absent optional provider keys → the app degrades to `mock` (no crash, no PHI egress).

## KMS / encryption at rest
- Volume + RDS + S3 encryption with a customer-managed KMS key per data-residency region.
- **Application-layer envelope encryption** for PII columns (`libs/db/encryption.ts`): a per-tenant
  data key wraps `clients.display_label`, `mrn`, etc. Destroying the data key crypto-shreds the tenant.

## Backups & DR
- RDS automated backups + PITR, 35-day window, encrypted, same-region residency.
- Quarterly **restore drills**; post-restore, verify audit-chain integrity (`/audit/verify`).
- RPO ≤ 5 min (PITR), RTO ≤ 1 h (documented in the ops runbook).

## WAF & rate-limiting
- Edge WAF (managed rules: OWASP top-10, bad bots) in front of the API.
- **App-layer rate limiting** already in the gateway (`apps/api/src/plugins/rate-limit.ts`,
  `RATE_LIMIT_PER_MIN`) returns typed `429` + `Retry-After`. See `apps/api/test/auth.spec.ts`.
- See [`waf-rate-limit.example.yaml`](./waf-rate-limit.example.yaml).

## TLS
- TLS 1.2+ terminated at the load balancer; HTTP→HTTPS redirect; HSTS preload emitted by the app
  (`apps/api/src/plugins/security.ts`, `enableHsts`). Internal service-to-service also TLS.

## Network
- Private subnets for PG/Redis; no public ingress to data stores. Security groups least-privilege.
- Egress allow-list to approved subprocessors only (see subprocessors tracker).

## DAST
- OWASP ZAP baseline in CI against staging: [`../test/security/zap-baseline.yaml`](../test/security/zap-baseline.yaml).
