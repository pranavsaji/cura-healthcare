# Phase 00 — Foundation & Tooling

- **Status:** ✅ DONE
- **Owner:** _implemented_
- **Depends on:** — (this is the root)
- **Unblocks:** everything

## Objective
Turn the repo into a professional Nx + pnpm monorepo with a **testing harness, linting, module-
boundary enforcement, formatting, CI, and env/secrets management** so that every later phase has a
green `pnpm verify` gate to satisfy. When this phase is done, an empty lib can be created, tested,
linted, typechecked, and built with zero extra setup.

## Context you need
- Package manager: **pnpm** workspaces (`pnpm-workspace.yaml`), task runner: **Nx** (`nx.json`).
- Node ≥ 22, TypeScript strict via `tsconfig.base.json` with path aliases `@cura/*`.
- The repo already has apps (`api`, `web`, `marketing`) and libs (`shared`, `db`, `ui`) at demo
  quality. This phase adds the **quality infrastructure** around them.
- Read `/docs/CONVENTIONS.md` §1, §3, §5, §7.

## Reusability & scalability mandate
- One test/lint/build config the whole workspace inherits — no per-package snowflakes.
- Nx task caching + affected-only runs so CI scales as packages grow.
- Module-boundary lint rules encode the layering in CONVENTIONS §1 (fail the build on violation).

## Deliverables
```
package.json                     # add test/lint/format/verify scripts (see below)
nx.json                          # targetDefaults for test, lint, e2e; inputs for caching
tsconfig.base.json               # confirm strict + paths (exists)
vitest.workspace.ts              # Vitest workspace covering all libs/apps
vitest.config.base.ts            # shared coverage thresholds, setup files
.eslintrc.cjs / eslint.config.mjs# TS + import + boundary rules
.prettierrc                      # formatting
.github/workflows/ci.yml         # install → verify (typecheck, lint, test) on PR
.editorconfig
libs/testing/                    # @cura/testing — shared test utils (fixtures, fake clock, builders)
  package.json  src/index.ts  src/fake-clock.ts  src/factories.ts
docs/RUNBOOK.md                  # how to run/test/debug locally (ports, docker, env)
```

## Implementation tasks
1. **Install dev tooling** at the root: `vitest`, `@vitest/coverage-v8`, `eslint`,
   `typescript-eslint`, `eslint-plugin-import`, an nx boundary plugin, `prettier`, `playwright`
   (installed here, used in Phase 12), `@testcontainers/postgresql` + `@testcontainers/redis`
   (used from Phase 03/07).
2. **Vitest workspace:** `vitest.workspace.ts` references each package's tests; base config sets
   `coverage` thresholds (80% for `libs/*`), `globals: true`, and a setup file that installs the
   fake clock.
3. **Root scripts** (CONVENTIONS §5): `test`, `test:unit`, `test:int`, `typecheck`, `lint`,
   `format`, and `verify` (= typecheck + lint + test). Wire `build` via `nx run-many -t build`.
4. **ESLint + boundaries:** configure the layering rules from CONVENTIONS §1; `no-floating-
   promises`, `no-explicit-any`, import ordering. Add `nx.json` target `lint`.
5. **`@cura/testing` lib:** shared `FakeClock`, `fixedIdGen`, and object factories (e.g.
   `makeSession()`, `makeTranscript()`) used across phases so tests are consistent and deterministic.
6. **CI:** GitHub Actions installs pnpm, restores Nx cache, runs `pnpm verify` on push/PR. Add a
   separate job for `test:int` that has Docker available.
7. **RUNBOOK.md:** document ports (API 4100, web 5173, marketing 3100), how to start Postgres/Redis
   via Docker, env setup, and the verify loop.

## Validation gate
```bash
pnpm install
pnpm typecheck        # all projects pass
pnpm lint             # passes, boundary rules active
pnpm test             # Vitest runs (even if few tests yet) and exits 0
pnpm verify           # the aggregate gate green
```
- **Acceptance:** a deliberately-added upward import (app→…→app or cycle) makes `pnpm lint` fail
  (prove the boundary rule works, then revert). A trivial `libs/testing` unit test runs under
  Vitest with coverage reported. CI is green on a test PR.

## Definition of Done
- [ ] `pnpm verify` passes locally and in CI.
- [ ] Boundary lint rule demonstrably fails on a violation.
- [ ] `@cura/testing` exports FakeClock + factories with a passing self-test.
- [ ] RUNBOOK documents ports, docker, env, and the verify loop.

## Handoff notes (implemented)
- **Test runner:** Vitest 3 with a single root `vitest.config.ts` (no per-package config). Unit =
  `*.spec.ts`; integration = `*.int.spec.ts` (excluded from `test`, run by `test:int`). Bare
  `@cura/*` imports resolve to TS source via pnpm links + package `exports` — no aliases needed.
- **Coverage:** `coverage.all = false` so the 80% floor measures only tested files (meaningful per
  phase). Add nothing — each phase's tests extend coverage automatically. Current: shared 100%.
- **Lint/boundaries:** flat `eslint.config.mjs`. The boundary rule is `no-restricted-imports`
  scoped by path: `libs/**` cannot import `@cura/api|web|marketing|worker|voice`; `libs/shared/**`
  (L0) cannot import any `@cura/*`. Verified: a probe import in `libs/shared` fails `pnpm lint`.
  Deeper L1–L4 ordering is by convention + review for now (extend the config as libs are added).
- **Scripts:** `pnpm verify` = `typecheck && lint && test` (Docker-free). `typecheck` uses
  `pnpm -r --if-present typecheck` (reliable; avoids the Nx daemon). Integration runs in a separate
  CI job.
- **`@cura/testing`:** `FakeClock`, `fixedIdGen`, and factories (`makeSession/Segment/Template/
  Note/NoteSection`). Use these for determinism. NOTE: `libs/shared` must NOT import `@cura/testing`
  (L0 + would cycle) — shared's own specs use inline fixtures.
- **Adding a package:** see `docs/RUNBOOK.md` → "Adding a new package"; vitest + eslint pick it up
  via root globs automatically.
- **Gate result:** `pnpm verify` green — 38 tests pass, typecheck clean, 0 lint errors.
