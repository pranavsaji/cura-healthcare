# Phase 11 — Note Engine (`@cura/notes`)

- **Status:** DONE
- **Owner:** _agent_
- **Depends on:** 09, 10
- **Unblocks:** 12 (editor), 13 (sync)

## Objective
The clinical note-generation engine: template system (SOAP/DAP/BIRP/GIRP/SIRP/PIRP/PIE/custom),
structured LLM generation into the template's section schema, **evidence linking** (every claim
traces to a transcript span), **risk/safety flagging**, and the **personalization loop** that learns
each clinician's voice from their edits.

## Context you need
- Demo exists (`apps/api/src/notegen.ts` + `providers/llm.ts` heuristics). Replace heuristics with
  real structured generation via `@cura/llm` (Phase 09), keep the streaming + evidence + risk model.
- Templates + note/section/risk schemas live in `@cura/shared` (Phase 01).
- L3 layer: depends on `shared`, `core`, `llm`. Read `/plan.md` §7.

## Reusability & scalability mandate
- Template engine is data-driven (section schemas), so new formats need **no code**.
- Note generation is a pure pipeline `(template, transcript, style) → NoteSection[]` behind an
  interface, streamable, and reusable by web + worker.
- Personalization memory is tenant + clinician scoped and provider-agnostic.

## Deliverables
```
libs/notes/src/
  index.ts
  template-engine.ts     # resolve template → section schema; custom template validation
  note-generator.ts      # orchestrates @cura/llm structured gen per section; streaming
  evidence.ts            # map generated claims → transcript segment starts; flag unmapped
  risk.ts                # SI/HI/abuse/mandated-reporting detection (rules + LLM verify)
  personalization.ts     # ingest note_edits → style exemplars; inject into prompts
  prompts.ts             # note-gen prompt(s) registered in @cura/llm registry
  *.spec.ts
libs/notes/test/*.int.spec.ts   # against @cura/llm mock (deterministic)
```

## Implementation tasks
1. **Template engine:** resolve a format to its section schema; validate custom templates; expose
   sections + guidance to the generator.
2. **Structured generation:** for each section, call `llm.generateStructured(sectionSchema)` with
   the transcript + template guidance + clinician style exemplars; stream sections out as produced.
3. **Evidence linking:** require each section to cite transcript segment start-times; a post-pass
   flags any clinical claim with no supporting span (anti-hallucination). Unmapped → surfaced, not
   silently kept.
4. **Risk flags:** rule-based detection (port from demo) + an LLM verification pass for precision;
   emit `RiskFlag`s (never auto-act; clinician reviews).
5. **Personalization:** aggregate `note_edits` (Phase 03) into per-clinician style exemplars; inject
   into the prompt so voice match improves over sessions. Measure drift toward the clinician's edits.
6. **Determinism for tests:** run against the `@cura/llm` mock so results are stable; contract-test
   that structured output always matches the section schema.

## Validation gate
```bash
pnpm --filter @cura/notes test
pnpm typecheck && pnpm lint
```
- **Acceptance:** generating from a known transcript yields sections matching the chosen format's
  schema; **every retained clinical claim has ≥1 evidence link**, and a fabricated claim with no
  transcript support is flagged; a transcript containing "end my life" produces a `critical`
  `suicidal_ideation` flag; after feeding sample edits, the personalization exemplars change the
  prompt (asserted) — voice adaptation is active.

## Definition of Done
- [ ] Data-driven templates incl. custom; all 7 formats generate.
- [ ] Structured output always schema-valid (contract test).
- [ ] Evidence linking + unmapped-claim flagging enforced.
- [ ] Risk flags detected + verified; never auto-acted.
- [ ] Personalization loop consumes edits and affects generation.

## Handoff notes
- **Package:** `libs/notes` (`@cura/notes`, L3 → shared/core/llm). Public façade: `NoteEngine`
  (`new NoteEngine(llm).generate(input, { onSection, onRisk })`) — the one thing apps/worker use.
- **Prompts:** `note-section-gen@1` (per-section generation) added to the `@cura/llm` registry via
  `registerNotePrompts` / `noteEngineRegistry`; risk uses the existing `risk-scan@1`. Generation is
  **one section at a time** so sections stream to the editor as produced (streaming contract:
  `onSection(NoteSection)` fires per section, `onRisk(RiskFlag)` per finding).
- **Structured output:** `SectionGenSchema = { content: string, evidence: number[] }`; the mock
  synthesizes schema-valid values, so structured output is always parseable (contract test).
- **Evidence linking (`evidence.ts`):** two checks — (1) reference integrity (an `evidence` start
  must hit a real segment; dangling refs dropped + flagged), (2) content grounding (each sentence's
  content words must appear in the transcript ≥50%, else `unsupported_content`). A section with
  clinical content but no valid evidence → `no_evidence`. Unmapped claims are **surfaced, not kept**.
- **Risk (`risk.ts`):** rule floor (`scanRiskRules`, high recall, never dropped) + optional additive
  LLM verify pass (`RiskScanner.scan(t, { verify })`). Verify is enabled only on a real provider —
  the mock would synthesize spurious flags. Flags are advisory; the engine never auto-acts.
- **Personalization (`personalization.ts`):** `buildStyleProfile(clinicianId, edits)` aggregates
  `note_edits` `after` text (weighted by `styleDrift` = 1−Jaccard) into ≤5 exemplars, backfilled by
  template seeds; injected as `styleExemplars` → appears verbatim in the section prompt (asserted).
- **API wiring:** `apps/api/src/notegen.ts` now builds a `NoteEngine` from `createLlm(env)` (mock by
  default) — the demo heuristic `providers/llm.ts` was deleted. Same `generateNoteForSession` signature.
- **TODO for a later phase:** history-based personalization in the request path needs a
  `Store.listNoteEdits(clinicianId)` method (not yet on the `Store` interface); template
  `styleExamples` are wired today.
- **Validation:** `libs/notes` 39 unit tests + `test/note-engine.int.spec.ts` acceptance gate all
  green; `pnpm typecheck && pnpm lint && pnpm test` clean repo-wide.
