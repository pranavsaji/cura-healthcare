# Data Retention & Deletion Policy

_Phase 16 deliverable. HIPAA §164.312(c) / SOC 2 C1.2. How long each PHI class is kept and how it is
provably destroyed._

## Retention periods
Retention is **per-organization**, driven by `organizations.retention_days` (default **3650** days /
10 years, the common behavioral-health record floor). No global override — each tenant's policy wins.

| Data class | Table / store | Default retention | Deletion trigger |
|---|---|---|---|
| Session audio | object store (S3) | 30 days (configurable) | `recordings.retention_expires_at` TTL job |
| Transcripts | `transcripts` | `retention_days` | Retention job or account close |
| Notes | `notes` | `retention_days` | Retention job (signed notes may be legal-held) |
| Client identifiers | `clients` (encrypted) | `retention_days` | Account close + grace |
| Audit events | `audit_events` | ≥ 6 years (regulatory) | Never auto-deleted within window |

## Hard-delete (right to erasure / disposal)
- Deletion jobs are **idempotent, auditable, and forward-only**: each deletion emits an
  `audit_events` row (`data.deleted`) recording `orgId`, resource, and count — **never the content**.
- PII columns are envelope-encrypted; **crypto-shredding** (destroying the per-tenant data key) makes
  encrypted PHI unrecoverable even from backups that predate the delete.
- Object-store audio uses lifecycle TTL; deletion is verified by the job (list-after-delete).

## Backups
- Encrypted (KMS), same data-residency region (`organizations.data_residency`).
- Retained 35 days (PITR). Crypto-shredded tenants remain unreadable in older backups.
- Restore drills quarterly (SOC 2 A1.3) — verify audit-chain integrity after restore.

## Legal hold
A resource under legal hold is exempt from retention jobs until the hold is lifted; holds are recorded
as audit events. Implemented as a `legal_hold` flag checked by the deletion job.

## Verification
The retention/deletion jobs are auditable end-to-end: querying `audit_events` for `action` in
(`data.deleted`, `retention.purged`) reconstructs exactly what was destroyed and when.
