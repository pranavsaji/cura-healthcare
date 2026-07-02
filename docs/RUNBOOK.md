# Local Runbook

## Prerequisites
- Node ≥ 22, pnpm 10, Docker (only for integration tests / real Postgres+Redis).

## Install
```bash
pnpm install
cp .env.example .env      # optional — mock defaults work without it
```

## Ports
| Service | Port | Notes |
|---------|------|-------|
| API (`@cura/api`) | 4100 | 4000 was taken locally by another app |
| Web (`@cura/web`) | 5173 | Vite |
| Marketing (`@cura/marketing`) | 3100 | 3000 was taken locally |

## Run
```bash
pnpm dev              # API + web together
pnpm dev:marketing    # marketing site
pnpm dev:all          # API + web + marketing
```

## The quality gate (run before every commit / PR)
```bash
pnpm verify           # = typecheck + lint + unit tests
```
Individually:
```bash
pnpm typecheck        # tsc --noEmit across all packages
pnpm lint             # ESLint (incl. monorepo boundary rule, CONVENTIONS §1)
pnpm test             # Vitest unit tests (fast, no Docker)
pnpm test:cov         # unit tests with coverage (80% floor on libs/*)
pnpm format           # Prettier write
```

## Testing model
- **Unit** tests: `*.spec.ts`, run by `pnpm test` (no external services).
- **Integration** tests: `*.int.spec.ts`, run by `pnpm test:int` — these use
  [Testcontainers](https://testcontainers.com) and therefore **require Docker**. They are a
  separate CI job so the main `verify` gate stays Docker-free.
- Determinism: use `FakeClock` / `fixedIdGen` / factories from **`@cura/testing`** — never real
  time or randomness in unit tests.

## Database (only when working on persistence, Phase 03+)
```bash
docker run --rm -e POSTGRES_PASSWORD=cura -p 5432:5432 postgres:16
pnpm db:generate      # generate SQL migrations from the Drizzle schema
pnpm db:migrate       # apply migrations
```

## CI
`.github/workflows/ci.yml` runs `pnpm verify` on every PR, plus a separate `pnpm test:int` job
(Docker available on the runner).

## Adding a new package
1. Create `libs/<name>/package.json` (`@cura/<name>`, `type: module`, `main/types → src/index.ts`)
   and a `tsconfig.json` extending `../../tsconfig.base.json`.
2. Add a `typecheck` script (`tsc --noEmit`). Vitest and ESLint pick it up automatically via the
   root globs — no extra wiring.
3. Respect the layering in `docs/CONVENTIONS.md §1`; the boundary lint rule will fail on violations.
