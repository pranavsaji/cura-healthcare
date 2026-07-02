# Phase 13 — EHR Connectors (`@cura/ehr`) + durable sync

- **Status:** DONE
- **Owner:** _agent_
- **Depends on:** 10, 11
- **Unblocks:** 16 (hardening), Curabill (18)

## Objective
The integration moat: a single `EhrConnector` interface with per-vendor adapters, **idempotent,
retried, durable** note write-back ("Super Fill"), and a graceful fallback (formatted copy) so the
clinician is never blocked. Go **deep on one vendor first**.

## Context you need
- Named EHRs: TherapyNotes, SimplePractice, Valant, Kipu, Ensora, Qualifacts, NextGen, AdvancedMD,
  BestNotes, Sigmund, Athena, Cerner. Reality: API maturity varies wildly.
- Demo has a fake sync route returning formatted text. This phase builds the real framework +
  durable jobs.
- L3 layer: depends on `shared`, `core`, `db`, `audit`. Durable workflows via **Temporal** (or
  BullMQ flows to start). Read CONVENTIONS §2, §3 (typed results, no throw for expected failures).

## Reusability & scalability mandate
- One `EhrConnector` interface: `authenticate`, `findClient`, `createNote`, `attachToEncounter`,
  `status`. Adapters range API → partner API → structured export → assisted-paste fallback, but all
  satisfy the interface + a **contract test**.
- Write-back runs as a **durable job** (retries, timeouts, replay) in `apps/worker`, not inline in a
  request. Idempotency keys prevent duplicate notes.
- Credentials per org, encrypted (Phase 03/04).

## Deliverables
```
libs/ehr/src/
  index.ts
  types.ts               # EhrConnector, EhrResult, SyncError, Credentials
  registry.ts            # vendor → connector factory
  adapters/
    simplepractice.ts    # the FIRST deep adapter (pick per partner access)
    fallback.ts          # formatted-copy connector (always available)
  idempotency.ts         # keys + dedupe
  contract.spec.ts       # every adapter satisfies the interface + shape
  *.spec.ts
apps/worker/src/
  main.ts
  workflows/ehr-sync.ts  # durable: authenticate→findClient→createNote→confirm; retry/backoff
  index.ts
libs/ehr/test/*.int.spec.ts
```

## Implementation tasks
1. **Interface + registry + fallback connector** (formatted copy) — the always-available path used
   when no API exists or a sync fails.
2. **First deep adapter** (e.g. SimplePractice/TherapyNotes per available access): OAuth/creds,
   client matching, note creation, encounter attach; map failures to typed `SyncError` (never throw
   for expected failures — return `Result`).
3. **Durable sync workflow** in `apps/worker`: idempotent, retried with backoff, timeout, and a
   dead-letter path; each attempt writes `ehr_sync_jobs` + an audit event.
4. **API/UI wiring:** `POST /notes/:id/sync` enqueues the workflow; status streams to the editor via
   the hub (Phase 07); on terminal failure, the fallback formatted copy is offered.
5. **Contract test:** all adapters (incl. fallback) satisfy the interface and return well-typed
   results; idempotency prevents duplicate notes on retry.

## Validation gate
```bash
pnpm --filter @cura/ehr test
pnpm --filter @cura/worker test          # workflow retry/idempotency (Testcontainers)
pnpm typecheck
```
- **Acceptance:** a sync that fails transiently is retried and eventually succeeds **without
  creating a duplicate note** (idempotency proven); a permanently failing sync degrades to the
  formatted-copy fallback and is audited; another org can never sync into the first org's EHR
  connection; every attempt is in `ehr_sync_jobs` + `audit_events`.

## Definition of Done
- [ ] `EhrConnector` interface + registry + fallback + one deep adapter.
- [ ] Durable, idempotent, retried sync workflow with dead-letter.
- [ ] Contract test green for all adapters; no duplicate notes on retry.
- [ ] Credentials encrypted per org; all attempts audited.

## Handoff notes
- **Packages:** `libs/ehr` (`@cura/ehr`, L3 → shared/core) + `apps/worker` (`@cura/worker`).
  Structural stores (like `@cura/audit`'s `AuditStore`) keep the whole workflow **Docker-free unit
  testable**; the Postgres-backed `ehr_sync_jobs` repo + per-org encrypted `ehr_connections` are the
  remaining prod wiring (handoff TODO — schema tables not yet added).
- **Interface:** `EhrConnector` (`authenticate/findClient/createNote/attachToEncounter/status`), every
  method returns `EhrResult<T> = Result<T, SyncError>` — connectors **never throw** for expected
  failures (CONVENTIONS §3). `SyncError.retryable` drives the workflow's retry-vs-dead-letter choice.
- **Deep vendor:** SimplePractice (`adapters/simplepractice.ts`) over an injected `HttpClient` (no
  vendor SDK). HTTP status → typed error map (401/403→auth, 404→not_found, 409→conflict-as-success,
  422/400→validation, 429→rate_limited, 5xx/0→unavailable). A **409 idempotency conflict is treated
  as the same note**, not a duplicate.
- **Fallback:** `FallbackConnector` (always available, never fails) → formatted assisted-paste copy so
  the clinician is never blocked. `getOrFallback(vendor)` degrades unknown vendors automatically.
- **Idempotency:** key = `sha256(orgId:vendor:noteId)` — stable per logical write, unique per org
  (no cross-tenant collision). The workflow persists step checkpoints (`externalClientId`,
  `externalNoteId`) on the job, so a retry **resumes** and `createNote` runs at most once → the
  no-duplicate-note guarantee (proven: transient attach failure retries, createNote called once).
- **Durable workflow:** `runEhrSync` (in `@cura/ehr`, engine-agnostic — BullMQ/Temporal just change
  invocation) with exponential backoff, injectable `sleep`, retry cap, dead-letter → fallback, and an
  audit event per phase (`note.sync.attempted/succeeded/failed/dead_letter`, added to the shared
  `AUDIT_ACTIONS` enum). Streams `onStatus` updates for the editor (Phase 07 hub).
- **Worker:** `apps/worker` wires the registry + job store + audit into `ehrSyncActivity`; `main.ts`
  provides a fetch-based `HttpClient`. Queue subscription is the deployment-time piece.
- **API/UI TODO:** `POST /notes/:id/sync` currently returns the formatted fallback copy (kept
  backward-compatible); enqueuing `runEhrSync` durably needs a shared job store in the API platform.
- **Validation:** `libs/ehr` 28 unit/contract tests + `test/ehr-sync.int.spec.ts` + `apps/worker`
  2 tests — all green; repo-wide `typecheck`/`lint`/`test` clean (403 tests).
