# Subprocessors & BAA Tracker

_Phase 16 deliverable. Every third party that could touch PHI, its purpose, and BAA status. **Rule
(CONVENTIONS §6): no real subprocessor touches PHI without a signed BAA.** Until a BAA is executed,
the provider's `mock` implementation is the ONLY allowed path in shared/dev environments._

| Subprocessor | Purpose | PHI touched | BAA status | Prod-enabled? |
|---|---|---|---|---|
| WorkOS | SSO / identity | No (auth metadata) | ☐ Pending | Gated by `AUTH_PROVIDER` |
| Anthropic (Claude) | Note generation, agents | Transcript → note | ☐ Pending | **No** — `LLM_PROVIDER=mock` until BAA |
| ASR vendor (e.g. Deepgram) | Speech-to-text | Audio → transcript | ☐ Pending | **No** — `ASR_PROVIDER=mock` until BAA |
| Cloud provider (AWS) | Compute, S3, KMS, RDS | All (at rest) | ☐ Pending | Infra only; BAA required |
| Telephony (Twilio/LiveKit) | Voice (Curadesk, Phase 17) | Call audio | ☐ Pending | **No** — `mock` until BAA |
| Clearinghouse (Curabill, Phase 18) | Claim submission | Claims (PHI) | ☐ Pending | **No** — `mock` until BAA |

## Enforcement
- Provider selection is env-driven (`*_PROVIDER`); the default is `mock`.
- CI/staging run with mock providers only. A real provider is enabled per-environment **only after**
  its BAA row above is checked and legal sign-off recorded.
- Adding a subprocessor requires: (1) a row here, (2) a signed BAA, (3) a data-flow update, (4) an
  access review.

## Change log
- 2026-07 — Initial tracker created (Phase 16). All BAAs pending; platform runs mock-only.
