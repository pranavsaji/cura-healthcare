# Phase 08 — ASR Providers (`@cura/transcription`)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 04
- **Unblocks:** 10 (scribe capture)

## Objective
A streaming speech-to-text layer behind one interface, with real providers (**Deepgram**,
**AssemblyAI**) and an offline **mock**, plus speaker diarization, medical/behavioral-health
vocabulary boosting, and a high-accuracy batch re-pass — selected by config, provable via a contract
test.

## Context you need
- Demo interface exists (`apps/api/src/providers/asr.ts`, mock only). This phase promotes it to a
  reusable `libs/transcription` package with real providers + tests.
- Latency budget: partials < ~1.5s (CONVENTIONS/plan NFRs). BAAs required before real PHI.
- L3 layer: depends on `shared`, `core`.

## Reusability & scalability mandate
- One `AsrProvider` interface: `openStream(cb) → AsrStream { pushAudio, pushText, close }` +
  `transcribeBatch(audio)`. Apps never import Deepgram/AssemblyAI SDKs directly.
- **Contract test** guarantees mock and real providers emit the same shapes (`TranscriptSegment`
  from `@cura/shared`).
- Vocabulary + diarization config are provider-agnostic inputs.

## Deliverables
```
libs/transcription/src/
  index.ts
  types.ts               # AsrProvider, AsrStream, AsrCallbacks, AsrOptions
  mock.ts                # offline: pushText → partial+segment (port from demo)
  deepgram.ts            # streaming + batch; diarization; keyword boosting
  assemblyai.ts          # streaming + batch
  vocabulary.ts          # BH/medical term lists + boosting config
  diarization.ts         # speaker mapping helpers (clinician/client heuristics)
  factory.ts             # createAsrProvider(config) → mock|deepgram|assemblyai
  contract.spec.ts       # runs the same suite against every provider (real gated by keys)
  *.spec.ts
```

## Implementation tasks
1. **Interface + factory** selected by `ASR_PROVIDER`; default `mock`. Real providers no-op to mock
   when their key is absent so dev never breaks.
2. **Deepgram streaming:** open WS to Deepgram, forward audio frames, map results → `partial` +
   finalized `TranscriptSegment` (speaker, start/end, confidence). Enable diarization + keyword
   boosting from `vocabulary.ts`.
3. **AssemblyAI streaming:** same contract.
4. **Batch re-pass:** `transcribeBatch(audio)` for the high-accuracy transcript used by note-gen
   (Phase 11) after the session ends.
5. **Diarization mapping:** normalize provider speaker labels to `clinician|client|unknown`.
6. **Contract test:** a shared suite (feed known audio/text, assert segment shape, ordering, speaker
   normalization) run against mock always, and against real providers when keys are present (CI
   secret-gated).

## Validation gate
```bash
pnpm --filter @cura/transcription test         # mock + contract always run
ASR_PROVIDER=deepgram DEEPGRAM_API_KEY=… pnpm --filter @cura/transcription test   # optional, gated
pnpm typecheck
```
- **Acceptance:** mock and (when keyed) Deepgram both satisfy the contract suite; segments are
  well-ordered with normalized speakers and 0–1 confidence; missing key transparently falls back to
  mock; batch re-pass returns a full transcript.

## Definition of Done
- [ ] `AsrProvider` interface + factory; mock + Deepgram + AssemblyAI implemented.
- [ ] Contract test passes for mock (and real when keyed).
- [ ] Diarization normalized; vocabulary boosting wired.
- [ ] No vendor SDK imported outside this package.

## Handoff notes
- **Package:** `@cura/transcription` (L3, deps: `shared`, `core`). Public surface via `src/index.ts`.
- **Interface:** `AsrProvider.openStream(cb, opts) → AsrStream { pushAudio, pushText, close }` and
  `transcribeBatch(audio, opts) → TranscriptSegment[]`. Factory: `createAsrProvider(config, { onFallback })`.
- **Default provider:** `mock` (offline, deterministic). Real providers (**Deepgram**,
  **AssemblyAI**) implemented with Node 22's **global `fetch` + `WebSocket`** — no vendor SDK is
  imported anywhere, so no new runtime deps and dev/CI need no network.
- **Key-absent fallback:** selecting a real provider without its key transparently returns the mock
  (via `onFallback` for logging) — dev never breaks, no PHI leaves before a BAA + key are in place.
- **Diarization:** provider labels (Deepgram ints, AssemblyAI letters) are normalized by
  `DiarizationMapper` → `clinician|client|unknown`. Heuristic: first distinct speaker → clinician,
  second → client. Explicit role words pass through. `AsrOptions.fixedSpeaker` pins a single role
  (dictation).
- **Vocabulary:** `vocabulary.ts` ships BH + medical term lists; `buildVocabulary(extra)` merges
  caller terms; rendered to Deepgram `keywords=term:boost` and AssemblyAI `word_boost`. Multi-word
  phrases get a higher boost.
- **Batch re-pass:** Deepgram uses `utterances=true`; AssemblyAI uses upload→transcript→poll with
  `speaker_labels`. Both map to ordered `TranscriptSegment[]` (seconds, 0–1 confidence).
- **Tests:** contract suite (`contract.spec.ts`) runs against mock always; Deepgram/AssemblyAI run
  only when `DEEPGRAM_API_KEY` / `ASSEMBLYAI_API_KEY` are set (CI secret-gated). Real providers'
  request-building + response-mapping are additionally covered offline by stubbing `fetch`/
  `WebSocket`. Coverage on `libs/transcription/src` ≈ 93% lines.
- **BAA status:** not yet signed for either vendor → `mock` remains the only allowed path in
  shared/dev per CONVENTIONS §6 until BAAs are executed.
- **Config knobs (already in `@cura/core`):** `ASR_PROVIDER` (`mock|deepgram|assemblyai`),
  `ASR_API_KEY`. Deepgram default model `nova-2-medical`.
