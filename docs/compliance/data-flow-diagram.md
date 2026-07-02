# PHI Data-Flow Diagram

_Phase 16 deliverable. Where PHI enters, rests, moves, and leaves the system, and the control at each
boundary. Every arrow crossing a trust boundary is TLS + audited._

## Trust boundaries + flow

```
   Clinician browser (apps/web)                        Marketing (apps/marketing)
        │  TLS, consent-gated                                 │  NO PHI, static
        ▼                                                     ▼
 ┌─────────────────────── API Gateway (apps/api) ───────────────────────┐
 │  security.ts: headers/CORS/CSRF   auth.ts: SSO+RBAC+tenant  errors    │
 │  every request → TenantContext(orgId) → tenant-scoped store           │
 └───────┬───────────────┬───────────────┬───────────────┬──────────────┘
         │ audio          │ transcript    │ note          │ audit event
         ▼                ▼               ▼               ▼
   Object store      ASR provider     LLM gateway      audit_events
   (S3/KMS, PHI)     (@cura/transcr.) (@cura/llm)      (hash-chained)
         │  encrypted     │  BAA req'd    │  BAA req'd     │  tamper-evident
         ▼                ▼               ▼               ▼
   Postgres (PHI columns envelope-encrypted) ── retention/hard-delete jobs
         │
         ▼  signed note, human-approved
   EHR connectors (@cura/ehr) → external EHR (TLS, idempotent, audited)
```

## PHI at each stage

| Stage | PHI present | Control |
|---|---|---|
| Browser capture | audio | Consent event precedes capture (Phase 10); TLS |
| Gateway | all classes | RBAC + tenant scope; PHI-free logs (`phi-logs.spec.ts`) |
| Object store | audio | KMS/AES-256, retention TTL, signed URLs |
| ASR provider | audio → transcript | BAA required; `mock` until then |
| LLM gateway | transcript → note | BAA required; `mock` until then; no PHI in prompts logs |
| Postgres | transcripts, notes, identifiers | Envelope-encrypted PII columns; row-level `orgId` scope |
| Audit log | metadata only (no content) | Hash-chained; never stores note/transcript text |
| EHR sync | signed note | Human sign-off gate; idempotency key; audited |

## Egress points (PHI leaving Cura)
1. **ASR/LLM providers** — gated by BAA; mock-only until signed.
2. **EHR connectors** — only a **human-signed** note, idempotent + audited.
3. **Backups** — encrypted, same-region residency (`organizations.data_residency`).

No PHI flows to telemetry, marketing, or third-party analytics.
