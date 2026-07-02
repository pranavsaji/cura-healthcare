# Incident Response Runbook

_Phase 16 deliverable. HIPAA §164.308(a)(6) / SOC 2 CC7.3. What to do when a security or availability
incident is suspected, including the breach-notification clock._

## Severity levels
| Sev | Definition | Examples | Ack | Resolve target |
|---|---|---|---|---|
| SEV1 | Confirmed/likely PHI breach or full outage | Cross-tenant data exposure, DB exfiltration, ransomware | 15 min | 4 h |
| SEV2 | Security control failure, no confirmed exposure | Auth bypass found, secret leaked, partial outage | 30 min | 24 h |
| SEV3 | Degraded / potential issue | Elevated error rate, dependency CVE (critical) | 4 h | 3 d |

## Roles
- **Incident Commander (IC):** owns the response, single decision-maker.
- **Scribe:** timestamps every action in the incident channel (this becomes the audit record).
- **Comms:** customer/regulator notifications (SEV1/2).
- **SME:** the engineer(s) with the deepest context on the affected system.

## Procedure
1. **Detect & declare.** Anyone can declare. Open `#inc-<date>`, page the on-call IC.
2. **Contain.** Revoke exposed credentials (rotate — see below), disable the affected path via a
   **feature flag** (`libs/core/flags.ts`), or scale the compromised replica to zero. Prefer
   containment over forensics-preserving delay for active exfiltration.
3. **Assess PHI impact.** Use the **hash-chained audit log** (`libs/audit`, `/audit/verify`) to
   determine exactly which `orgId`/resources were accessed and by whom. This is the authoritative
   record of what PHI was touched.
4. **Eradicate & recover.** Patch, restore from encrypted backup if needed (see
   [`../../infra/README.md`](../../infra/README.md)), verify audit-chain integrity post-restore.
5. **Notify.** If PHI breach confirmed: the HIPAA **60-day** individual-notification clock starts at
   discovery; > 500 individuals → HHS + media notice. Comms owns the timeline; Legal drafts.
6. **Post-incident review.** Blameless PIR within 5 business days: timeline, root cause, and
   **at least one systemic fix + one new automated test** (the self-improvement loop).

## Secret rotation quick reference
- Session secret (`SESSION_SECRET`/`ENCRYPTION_KEY`): rotate in the vault → rolling restart. Existing
  sessions invalidate (expected).
- Provider keys (`ANTHROPIC_API_KEY`, `ASR_API_KEY`, `WORKOS_API_KEY`): rotate at vendor → update
  vault → restart. Providers fall back to `mock` if a key is absent (no crash).
- DB credentials: rotate via secrets manager; connection pool re-auths on reconnect.

## Contacts
Maintain an up-to-date on-call rotation + Legal/Privacy Officer contact in the ops vault (not in git).
