# Phase 18 — Curabill (RCM / Billing Vertical)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 16 (and reuses `libs/agents` from 17)
- **Unblocks:** —

## Objective
The third vertical: billing agents that verify eligibility, submit claims, follow up with payers, and
**catch issues before they become denials** — a payer-rules engine + X12 (837/835) pipeline +
denial prediction with a learning loop, on the shared platform. Highest compliance + correctness bar.

## Context you need
- Expansion vertical; reuse Phases 04–14 + the agent runtime from Phase 17. New surface = claims/X12,
  clearinghouse, payer rules, denial prediction.
- Pre-trained knowledge: 5,000+ payers, claim/CARC/RARC codes, auth rules. Read `/plan.md` §1.2
  (Curabill), §2.4.
- **No real money/claim submission without explicit human approval + full audit** (CONVENTIONS §6;
  financial actions are gated).

## Reusability & scalability mandate
- **New `libs/rcm`** (X12, payer rules, denial model) + `apps/worker` durable workflows; identity,
  tenancy, memory, audit, agent runtime reused unchanged.
- Clearinghouse + payer portals behind interfaces (+ mock + contract test), like EHR/telephony.
- The denial-prediction learning loop is tenant-scoped and auditable.

## Deliverables
```
libs/rcm/src/
  x12/                    # 837 (claims) build + 835 (ERA) parse; validation
  eligibility.ts         # 270/271 eligibility checks (interface + mock + real)
  payer-rules.ts         # rules engine (per-payer requirements, auth rules)
  denials.ts             # CARC/RARC mapping; denial detection + prediction
  learning.ts            # feedback loop over accept/deny outcomes → sharper rules
  clearinghouse.ts       # submit/track claims (interface + adapters + mock)
  *.spec.ts  contract.spec.ts
apps/worker/src/workflows/
  claim-submit.ts  denial-followup.ts  payment-posting.ts   # durable, retried, audited, HITL-gated
apps/web/src/routes/billing.tsx    # claims, denials, follow-ups, approvals
db: claims, remittances, denials, eligibility_checks, payers, payer_rules
```

## Implementation tasks
1. **X12:** build valid **837** claims from encounters; parse **835** ERAs; strict schema validation
   with clear errors.
2. **Eligibility (270/271)** + **clearinghouse** submit/track behind interfaces (+ mock + real);
   contract-tested.
3. **Payer rules engine:** per-payer requirements/auth rules; pre-denial checks flag issues before
   submission ("catch issues before they become denials").
4. **Denials:** map CARC/RARC reasons; detect + **predict** likely denials; draft appeals/follow-ups
   via the agent runtime.
5. **Learning loop:** every approval/rejection/correction updates per-tenant rules/memory (auditable),
   sharpening future predictions ("0 repeat mistakes").
6. **Durable workflows** (`apps/worker`): claim submit, denial follow-up, payment posting — idempotent,
   retried, **human-approval-gated**, fully audited.
7. **Billing UI:** claims/denials/follow-ups with an explicit approval step for money-moving actions.

## Validation gate
```bash
pnpm --filter @cura/rcm test          # X12 build/parse, rules, denial mapping, learning
pnpm --filter @cura/worker test       # workflow idempotency/retry/HITL (Testcontainers)
pnpm typecheck && pnpm verify
```
- **Acceptance:** a generated 837 validates against the X12 schema and round-trips; the rules engine
  flags a known pre-denial condition before submission; a submitted claim's 835 is parsed and posted;
  **no claim is submitted without a recorded human approval** (gate proven) and every step is audited;
  the learning loop measurably changes a prediction after feedback; all data tenant-scoped.

## Definition of Done
- [ ] 837 build + 835 parse validated + round-tripped.
- [ ] Eligibility + clearinghouse behind interfaces (+ mock/contract).
- [ ] Payer-rules pre-denial checks + denial prediction + learning loop.
- [ ] Durable, idempotent, **human-gated**, audited money-moving workflows.

## Handoff notes
**Delivered (validated 2026-07):**
- **`@cura/rcm`** (`libs/rcm`):
  - **X12** (`x12/`): `build837`/`parse837`/`validate837` (real ISA/GS/ST envelope, CLM/HI/SV1,
    control numbers, self-consistent SE count, balance check) — **builds a valid 837 and round-trips**;
    `build835`/`parse835` (BPR/TRN/CLP + CAS with CARC/RARC).
  - **`payer-rules.ts`** — data-driven engine; `evaluateClaim` flags **pre-denial** conditions
    (missing prior auth → CARC 197, referring provider, timely filing, $0) BEFORE submission.
  - **`denials.ts`** — CARC/RARC library + `detectDenials` (ignores contractual write-offs on paid
    claims) + `predictDenial` (noisy-OR of the rules signal and the learned rate).
  - **`learning.ts`** — `InMemoryLearningStore`: per-tenant, per-(payer,cpt) outcomes; **feedback
    measurably moves the prediction** (0→0.8 after 4/5 denials) and stays tenant-scoped.
  - **`eligibility.ts`** — 270/271 `EligibilityChecker` reusing `@cura/benefits` (records checks).
  - **`clearinghouse.ts`** — `Clearinghouse` interface + `MockClearinghouse` (idempotent, rejects
    malformed 837) + contract test.
- **`apps/worker/src/workflows/`** — durable, idempotent, **HITL-gated**, audited:
  - `claim-submit.ts`: build→validate→**pre-denial gate**→**human approval**→submit (retried).
    **No claim is submitted without a recorded approval** (proven); a blocking finding halts it.
  - `payment-posting.ts`: post 835, surface denials, **feed the learning loop**; idempotent by EFT #.
  - `denial-followup.ts`: draft appeals from CARC, **HITL-gate** the appeal submission (skips PR).
- **Web:** `apps/web/src/routes/billing.tsx` — claims, denials, follow-ups, and the explicit
  **approve-&-submit** control (UI half of the server-side HITL gate) + nav (`claims:read`).
- **DB:** `libs/db/schema.ts` adds `payers`, `payer_rules`, `eligibility_checks`, `claims`,
  `remittances`, `denials` — all `orgId`-scoped, indexed.

**Choices:** clearinghouse = interface + mock (Availity/Change in prod, gated by BAA); X12 = a
hand-rolled faithful subset (no vendor lib) sufficient to build/validate/round-trip; rules = per-tenant
data (learnable); denial model = rules ⊕ learned-rate noisy-OR; audit = free-form actions via the
shared `AgentAudit` sink (adapt to the hash-chained log in prod). Money is integer **cents** everywhere;
X12 codecs convert at the boundary.

**Measured:** learning moves a clean-claim prediction 0 → 0.80 after 4/5 denials for a payer/procedure;
predictions are tenant-isolated.

**Validation:** `pnpm --filter @cura/rcm test` ✓ (25) · `pnpm --filter @cura/worker test` ✓ (12) ·
`pnpm typecheck && pnpm verify` ✓ (610 unit tests, lint clean).
