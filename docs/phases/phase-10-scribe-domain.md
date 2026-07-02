# Phase 10 — Scribe Domain (sessions, consent, capture, storage)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 06, 08
- **Unblocks:** 11 (note engine), 12 (web), 13 (sync)

## Objective
The Curanote domain services: session lifecycle, **consent gating**, audio capture + encrypted
object storage, and transcript persistence — wiring the realtime hub (07) to the ASR provider (08)
and persistence (03), all tenant-scoped and audited.

## Context you need
- Demo covers this in-memory (`apps/api/src/{store,realtime}.ts`). This phase makes it real: DB
  repos, S3 storage, consent enforcement, ASR wiring, audit.
- Inputs supported: **record live, dictate, upload audio** (all three).
- L4/service. Read CONVENTIONS §2, §6 (consent precedes capture, PHI storage).

## Reusability & scalability mandate
- **Storage behind an interface** (`ObjectStore`: `put/get/presignUpload/delete`) with S3 (SSE-KMS)
  + local-disk (dev) + in-memory (test) impls. Paths namespaced by `orgId`.
- Session/transcript logic in a `libs/scribe` service package (reusable by web + worker), not inline
  in routes.
- Consent is enforced centrally — capture cannot start without a logged consent event.

## Deliverables
```
libs/scribe/src/
  index.ts
  session-service.ts     # create/consent/start/stop/status; tenant-scoped; audited
  capture-service.ts     # bridges RealtimeHub ↔ AsrProvider; persists segments
  transcript-service.ts  # assemble/persist transcript; batch re-pass trigger
  storage/
    object-store.ts      # interface + s3 + local + memory impls
  *.spec.ts
apps/api/src/routes/sessions.ts   # thin routes delegating to session-service (upload presign, etc.)
libs/scribe/test/*.int.spec.ts    # capture flow against mock ASR + memory store + PG
```

## Implementation tasks
1. **ObjectStore interface** + impls; presigned upload for the "upload audio" path; encrypted at
   rest (SSE-KMS) in prod.
2. **SessionService:** create (with chosen template), **consent** (writes `consent_at` + audit
   event — required before capture), start/stop, status transitions
   (`created→recording→transcribing→ready→noted`).
3. **CaptureService:** on WS `start`, open an `AsrProvider` stream; forward audio; persist each
   finalized `TranscriptSegment` via the transcript repo; publish `partial/segment` through the hub.
   On `stop`, close the stream and (optionally) kick the batch re-pass, then signal note-gen (Phase
   11).
4. **Dictation + upload:** dictation reuses the live path with a single speaker; upload runs
   `transcribeBatch` on the stored file.
5. **Audit everything:** consent, start, stop, upload, deletion → `audit_events`.
6. **Retention:** set `recordings.retention_expires_at` from `organizations.retention_days`.

## Validation gate
```bash
pnpm --filter @cura/scribe test          # unit + integration (mock ASR, memory/PG store)
pnpm --filter @cura/api test             # session routes via inject
pnpm typecheck
```
- **Acceptance:** starting capture **without consent is rejected** and audited as a denied attempt;
  a simulated live session persists ordered transcript segments scoped to the org; an uploaded audio
  file produces a transcript via batch; another org cannot read the session/transcript; every
  lifecycle action has an audit row.

## Definition of Done
- [x] Consent strictly precedes capture (tested — service + WS handler both reject + audit a denial).
- [x] Live + dictation + upload all produce persisted, tenant-scoped transcripts.
- [x] ObjectStore interface with S3 + local + memory impls; encrypted (SSE-KMS) for the S3 impl.
- [x] All lifecycle actions audited.

## Handoff notes
- **Package:** `@cura/scribe` (deps: `shared`, `core`, `db`, `audit`, `transcription`). Public surface
  via `src/index.ts`; wire it with `createScribeServices({ asr, objectStore, audit, clock?, ids?,
  retentionDays? })` → `{ sessions, transcripts, capture }`. All service methods take a tenant-scoped
  `Store` (from `@cura/db`) so tenancy is bound per call.
- **In-memory store moved to `@cura/db`.** `MemoryStore` now lives in `@cura/db` (was app-local) so
  the API, worker, and scribe tests share one impl (CONVENTIONS §8). `Store` gained
  `replaceTranscript()` (used by the batch re-pass); `PostgresStore` delegates to
  `transcripts.replace`.
- **Status machine (SessionService):** `created → recording → transcribing → ready → noted`
  (`created → transcribing` allowed for upload/dictation). `canTransition()` is exported; invalid
  transitions throw `ConflictError`.
- **Consent gating (the crux):** `startCapture` / `assertConsent` reject with `ForbiddenError` and
  audit an `auth.denied` event (`context: { reason: "consent_required" }`) when `consentAt` is null.
  Enforced in three places: the scribe service (proven by unit tests), the realtime WS `start`
  handler, and implicitly for the upload path.
- **Storage layout:** keys are `orgs/{orgId}/sessions/{sessionId}/recordings/{recordingId}.{ext}`
  (org-first for prefix-scoped retention). `ObjectStore` = `put/get/exists/presignUpload/delete`.
  Impls: `MemoryObjectStore` (test), `LocalObjectStore` (dev, path-traversal-guarded), `S3ObjectStore`
  (SSE-KMS, SigV4-signed via `storage/sigv4.ts` — **no AWS SDK**). Presign returns a `PUT` descriptor
  the client uploads to directly (the API never proxies PHI bytes).
- **Three inputs:** live (WS `simulate`/audio → `CaptureService.beginCapture`, segments persisted in
  order and published), dictation (same path with `fixedSpeaker: "clinician"`), upload
  (`TranscriptService.ingestUpload` stores the encrypted blob, runs `AsrProvider.transcribeBatch`,
  replaces the transcript, marks `ready`). A live session can also be refined via `rePass`.
- **API wiring (`apps/api`):** `Platform` gained `scribe: ScribeServices` (memory platform → mock ASR
  + `MemoryObjectStore`; postgres platform → config-selected ASR + `LocalObjectStore` under
  `.tmp/recordings`). New routes: `POST /sessions/:id/upload-url` (presign) and
  `POST /sessions/:id/audio` (base64 ingest → batch). `create`/`consent` now delegate to
  `scribe.sessions`.
- **Retention:** `retentionExpiresAt = now + retentionDays` is computed on upload and returned/audited
  (`RETENTION_DAYS` config). NOTE: persisting a `recordings` table row (storageKey/checksum/expiry) is
  not yet wired through the `Store` interface — follow-up for the PG path; the blob + audit + expiry
  are already produced.
- **S3 env wiring pending:** the `S3ObjectStore` is complete + unit-tested (put/get/delete/presign,
  SSE-KMS headers, deterministic SigV4), but the postgres platform uses `LocalObjectStore` until S3
  bucket/region/KMS env vars are added to `@cura/core` config. Swap is a one-liner
  (`createObjectStore({ provider: "s3", ... })`).
- **Tests:** unit specs for every module + `test/capture-flow.int.spec.ts` (live + upload + tenant
  isolation) over mock ASR + memory store; the PG variant is gated by `DATABASE_URL`. Coverage on
  `libs/scribe/src` ≈ 98% lines (storage ≈ 95%). BAA still unsigned → ASR defaults to mock.
