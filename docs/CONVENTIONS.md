# Engineering Conventions

**Every phase must follow this document.** It exists so that work done in isolated sessions
(different apps, different agents) composes into one coherent, reusable, scalable system. When a
phase spec and this document conflict, this document wins unless the phase explicitly overrides it
with a justification in its handoff notes.

---

## 1. Monorepo boundaries (the dependency rule)

```
apps/*      →  may import from libs/*        (never from another app)
libs/*      →  may import from other libs/*  (no cycles; see layering)
libs/*      →  MUST NOT import from apps/*
```

**Layering (lower may not import higher):**

```
L0  libs/shared          types, zod schemas, pure functions, errors — ZERO runtime deps beyond zod
L1  libs/core            config, logger, ids, clock, result — depends on shared only
L1  libs/ui              design system — depends on shared only (browser-safe)
L2  libs/db              Drizzle schema + repositories — depends on shared, core
L2  libs/audit           hash-chained audit log — depends on shared, core, db
L2  libs/auth            WorkOS + RBAC + tenant context — depends on shared, core, db
L3  libs/transcription   ASR providers — depends on shared, core
L3  libs/llm             LLM gateway — depends on shared, core
L3  libs/notes           template + note engine — depends on shared, core, llm
L3  libs/ehr             EHR connectors — depends on shared, core, db, audit
L4  apps/api, apps/web, apps/marketing, apps/worker, apps/voice
```

A new dependency that crosses these layers upward is a design smell — stop and reconsider.

**Enforcement:** `nx graph` must stay acyclic; add lint rules (`@nx/enforce-module-boundaries` or
`eslint-plugin-boundaries`) in Phase 00. CI fails on a boundary violation.

---

## 2. Reusability & scalability mandate

The platform is **compound**: one set of shared capabilities powers three verticals (Curanote,
Curadesk, Curabill). Therefore:

- **Multi-tenant by construction.** Every domain row, cache key, storage path, log line, and audit
  event carries `orgId`. No query runs without a tenant scope. There is no "global" data path.
- **Provider-swappable.** External capabilities (ASR, LLM, storage, EHR, telephony, payments) sit
  behind an interface in a `libs/*` package with: (a) a `mock` implementation for offline dev/tests,
  (b) at least one real implementation, (c) selection by env var. No app imports a vendor SDK
  directly.
- **Stateless apps, stateful stores.** App processes hold no session state that can't be rebuilt
  from Postgres/Redis, so we can run N replicas. WebSocket fan-out goes through Redis pub/sub
  (Phase 07), never in-process memory in prod.
- **Everything is an audited action.** Any side effect touching PHI emits an `audit_events` row
  (Phase 04). Reusable helper, not per-feature code.
- **Config over hardcoding.** No secrets, URLs, model names, or limits in code — all via
  `libs/core` config (validated at boot).

---

## 3. Language, types, errors

- **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`). No `any` in committed
  code; use `unknown` + a zod parse at boundaries.
- **Validate at every boundary.** HTTP bodies, WS messages, provider responses, and env are parsed
  with **zod** schemas from `libs/shared`. Parsed types flow inward; raw types never do.
- **Typed errors.** Use the `AppError` taxonomy from `libs/shared` (`ValidationError`,
  `NotFoundError`, `AuthError`, `ConflictError`, `ProviderError`, `RateLimitError`, `InternalError`).
  Each carries an HTTP status + a stable `code`. The API error handler (Phase 06) maps them to
  responses; never leak stack traces or PHI in error bodies.
- **No throwing across provider boundaries for expected failures** — return typed results where the
  caller must handle both paths (e.g. EHR sync). Reserve `throw` for programmer errors + unexpected.

---

## 4. Naming & structure

- Files: `kebab-case.ts`. React components: `PascalCase.tsx`. One primary export per file where
  practical.
- Packages: `@cura/<name>`. Public surface only via each lib's `src/index.ts` barrel — do not deep-
  import another lib's internals.
- DB: `snake_case` columns, plural table names, `*_id` FKs, `created_at`/`updated_at` on every table.
- Env vars: `SCREAMING_SNAKE_CASE`, namespaced by concern (`ASR_PROVIDER`, `WORKOS_API_KEY`).
- Async funcs return `Promise<T>`; no floating promises (lint-enforced).

---

## 5. Testing strategy (the gate at every step)

**No phase is DONE until its tests pass in CI.** Test runner: **Vitest** (unit/integration),
**Playwright** (web e2e), **supertest/`fastify.inject`** (API), **Testcontainers** (real Postgres/
Redis for integration).

Test pyramid per phase:

| Level | Scope | Tooling | Where |
|-------|-------|---------|-------|
| **Unit** | pure logic, one module, deps mocked | Vitest | co-located `*.spec.ts` |
| **Integration** | a lib against a real dependency (PG/Redis/HTTP) | Vitest + Testcontainers | `*.int.spec.ts` |
| **Contract** | provider mock ≡ provider real (same interface, same shape) | Vitest | `libs/<x>/src/**/contract.spec.ts` |
| **API** | route → handler → store, in-process | Vitest + `fastify.inject` | `apps/api/test/**` |
| **E2E** | full flow through the browser | Playwright | `apps/web/e2e/**` |

Rules:
- **Every new module ships with a `*.spec.ts`.** A phase that adds code without tests is incomplete.
- **Provider interfaces get contract tests** so `mock` and real implementations can't drift.
- **Deterministic tests.** No real network, clock, or randomness in unit tests — inject `Clock` and
  `IdGen` from `libs/core`. Time-travel with fake timers.
- **Coverage floor:** 80% lines on `libs/*` domain logic (config in Phase 00). Apps rely more on
  e2e.
- **Golden path e2e** (Phase 12): consent → record → transcript → note → edit → sign → sync, using
  the mock providers, must pass headless in CI.

Standard commands (wired in Phase 00, available to every phase):

```bash
pnpm test                 # unit tests (fast, no containers) — same as test:unit
pnpm test:unit            # unit only
pnpm test:int             # integration (spins up Testcontainers; needs Docker)
pnpm test:cov             # unit tests with coverage (80% floor on tested files)
pnpm --filter @cura/web e2e   # Playwright
pnpm typecheck            # tsc --noEmit, all projects
pnpm lint                 # eslint + boundary rules
pnpm verify               # typecheck + lint + test  (the full gate; CI runs this Docker-free)
```

> `verify` runs unit tests (no Docker) so it stays fast and CI-friendly; integration tests run in a
> separate CI job via `test:int`.

---

## 6. Data protection & compliance (applies from Phase 00)

- **PHI classes:** audio, transcripts, notes, client identifiers. Treat all as PHI.
- Encrypt in transit (TLS) and at rest (KMS/AES-256). App-layer envelope-encrypt PII columns
  (`clients.display_label`, `mrn`, etc.).
- **Minimum-necessary logging.** Never log PHI or secrets. Loggers (`libs/core`) redact known PHI
  fields by default. Log `orgId`, ids, and durations — not content.
- **BAAs required** before any real subprocessor (ASR/LLM/cloud/telephony) touches PHI. Until then,
  the `mock` provider is the only allowed path in shared/dev environments.
- **Consent precedes capture.** No audio ingest without a logged consent event (Phase 10).
- **Retention & deletion** honor `organizations.retention_days`; hard-delete jobs are auditable.

---

## 7. Git & delivery

- Trunk-based, short-lived branches: `phase-06/api-gateway`, `feat/note-evidence-linking`.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`). End commit messages with
  the standard co-author trailer used in this repo.
- A phase merges only when `pnpm verify` is green and the phase's Definition of Done is checked.
- Migrations are forward-only and reviewed; never edit a shipped migration.

---

## 8. Definition of "reusable" (litmus test before writing app code)

Before putting logic in an app, ask: *would a second vertical need this?* If yes → it belongs in a
`libs/*` package behind an interface, with a mock and a contract test. Apps should be thin: routing,
composition, and presentation. Business capability lives in libs.
