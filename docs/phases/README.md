# Cura — Implementation Phase Playbook

This directory is the **execution plan** for building the full Cura platform. Each phase is a
**self-contained spec file** you can hand to a fresh agent (in any app/session) with a single
instruction like:

> "Read and implement `docs/phases/phase-06-api-gateway.md`. Follow `docs/CONVENTIONS.md`.
> Do not start until its declared dependencies are `DONE`."

Every phase file is written to stand alone: it restates the context it needs, names its exact
deliverables (file-by-file), and ends with a **validation gate** (tests + acceptance criteria)
that must pass before the phase is considered done. **No phase is complete until its tests are
green.**

> Product/architecture rationale lives in [`/plan.md`](../../plan.md). Engineering standards
> that ALL phases must follow live in [`/docs/CONVENTIONS.md`](../CONVENTIONS.md). Read both
> before implementing any phase.

---

## How to run a phase

1. **Check dependencies.** Open the phase file; confirm every phase in its `Depends on:` line is
   marked `DONE` in the tracker below. If not, stop and do those first.
2. **Read the conventions.** `docs/CONVENTIONS.md` defines lib boundaries, naming, error
   handling, and the testing strategy. Deviations must be justified in the phase's handoff notes.
3. **Implement the deliverables** exactly as listed. Prefer extending existing shared libs over
   creating new code (reuse first).
4. **Run the validation gate** at the bottom of the phase file. All commands must pass.
5. **Update the tracker** (this file) and write the phase's `Handoff notes` section with anything
   the next phase needs to know (new env vars, new commands, decisions, gotchas).

Each phase file has a status header. Keep it current: `PLANNED → IN PROGRESS → DONE`.

---

## Phase map & dependency graph

```
00 Foundation ──┬─► 01 Shared Kernel ─┬─► 02 Design System ─────────────► 12 Product Web
                │                      ├─► 03 Persistence ───┐
                │                      └─► 04 Platform Kernel ┼─► 05 Auth & Tenancy ─┐
                │                                             │                       │
                └────────────────────────────────────────────┴─► 06 API Gateway ◄────┘
                                                                    │
                        ┌───────────────────────────────┬──────────┤
                        ▼                                ▼          ▼
                 07 Realtime                     08 ASR Providers  09 LLM Gateway
                        │                                │          │
                        └──────────┬─────────────────────┴────┬─────┘
                                   ▼                           ▼
                            10 Scribe Domain ───────► 11 Note Engine
                                   │                           │
                                   └───────────┬───────────────┘
                                               ▼
                                        12 Product Web
                                               │
                             ┌─────────────────┼───────────────────┐
                             ▼                 ▼                   ▼
                    13 EHR Connectors   14 Observability     15 Marketing
                             │                 │
                             └────────┬────────┘
                                      ▼
                               16 Hardening & Compliance
                                      │
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
                17 Curadesk (voice)          18 Curabill (RCM)
```

**Critical path to a shippable scribe MVP:** 00 → 01 → 03 → 04 → 06 → 07 → 08 → 09 → 10 → 11 → 12.
Design system (02), EHR (13), observability (14), and marketing (15) can proceed in parallel once
their deps are met.

---

## Tracker

| # | Phase | File | Depends on | Status |
|---|-------|------|-----------|--------|
| 00 | Foundation & tooling | [phase-00-foundation.md](phase-00-foundation.md) | — | ✅ DONE |
| 01 | Shared kernel | [phase-01-shared-kernel.md](phase-01-shared-kernel.md) | 00 | ✅ DONE |
| 02 | Design system | [phase-02-design-system.md](phase-02-design-system.md) | 00, 01 | ✅ DONE |
| 03 | Persistence (Drizzle/PG) | [phase-03-persistence.md](phase-03-persistence.md) | 00, 01 | ✅ DONE |
| 04 | Platform kernel | [phase-04-platform-kernel.md](phase-04-platform-kernel.md) | 00, 01 | ✅ DONE |
| 05 | Auth & tenancy | [phase-05-auth-tenancy.md](phase-05-auth-tenancy.md) | 03, 04 | ✅ DONE |
| 06 | API gateway | [phase-06-api-gateway.md](phase-06-api-gateway.md) | 04, 05 | ✅ DONE |
| 07 | Realtime infrastructure | [phase-07-realtime.md](phase-07-realtime.md) | 06 | ✅ DONE |
| 08 | ASR providers | [phase-08-providers-asr.md](phase-08-providers-asr.md) | 04 | ✅ DONE |
| 09 | LLM gateway | [phase-09-providers-llm.md](phase-09-providers-llm.md) | 04 | ✅ DONE |
| 10 | Scribe domain | [phase-10-scribe-domain.md](phase-10-scribe-domain.md) | 06, 08 | ✅ DONE |
| 11 | Note engine | [phase-11-note-engine.md](phase-11-note-engine.md) | 09, 10 | ✅ DONE |
| 12 | Product web app | [phase-12-product-web.md](phase-12-product-web.md) | 02, 07, 11 | ✅ DONE |
| 13 | EHR connectors | [phase-13-ehr-connectors.md](phase-13-ehr-connectors.md) | 10, 11 | ✅ DONE |
| 14 | Observability & audit UI | [phase-14-observability.md](phase-14-observability.md) | 06, 12 | ✅ DONE |
| 15 | Marketing site | [phase-15-marketing.md](phase-15-marketing.md) | 02 | ✅ DONE |
| 16 | Hardening & compliance | [phase-16-hardening.md](phase-16-hardening.md) | 12, 13 | ✅ DONE |
| 17 | Curadesk (voice) | [phase-17-curadesk.md](phase-17-curadesk.md) | 16 | ✅ DONE |
| 18 | Curabill (RCM) | [phase-18-curabill.md](phase-18-curabill.md) | 16 | ✅ DONE |

---

## Phase file anatomy

Every `phase-XX-*.md` follows the same template so agents know exactly where to look:

1. **Status header** — status, owner, depends-on, unblocks.
2. **Objective** — one paragraph: what "done" means.
3. **Context you need** — the minimum you must know without reading the whole repo.
4. **Reusability & scalability mandate** — what must be generic/multi-tenant/swappable.
5. **Deliverables** — exact file tree to create/modify.
6. **Implementation tasks** — ordered, checkable steps.
7. **Validation gate** — commands + unit/integration/e2e tests + acceptance criteria.
8. **Definition of Done** — the checklist to flip status to DONE.
9. **Handoff notes** — filled in *after* implementation for the next phase.

> The current repo already contains a **working demo-grade slice** of several phases (in-memory
> store, mock providers, a Vite product app, a Next marketing page). Each phase's spec explains
> how to **harden the demo into the real thing** — replace mocks, add persistence, add tests.
> Treat existing code as a starting point to refactor, not sacred.
