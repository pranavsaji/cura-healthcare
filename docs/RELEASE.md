# Release & Rollback Process

_Phase 16 deliverable. How code goes from a PR to production safely: gates, migrations, rollback, and
feature flags for risky paths._

## Environments
`local → CI → staging → production`. Staging mirrors prod config (real infra, **mock** PHI providers
until BAAs are signed — see [`compliance/subprocessors.md`](./compliance/subprocessors.md)).

## Merge gate (every PR)
A PR merges only when **all** are green (CONVENTIONS §5/§7):
1. `pnpm verify` — typecheck + lint (incl. `@nx/enforce-module-boundaries`) + unit tests.
2. `pnpm test:int` — Testcontainers integration (real PG/Redis).
3. `pnpm test:security` — authz matrix + PHI-log scan + fuzz + dependency audit.
4. `pnpm test:chaos` — resiliency (replica kill, provider timeout, graceful shutdown).
5. `pnpm test:load` — NFR gate (partials <1.5s, note <60s).
6. Conventional-commit title; forward-only migration review if `libs/db` changed.

## Deploy pipeline (staging → prod)
1. Merge to trunk → CI builds immutable image, tags with the commit SHA.
2. Auto-deploy to **staging**; run smoke + golden-path e2e (`apps/web/e2e`) against it.
3. **Migration gate:** run `pnpm db:migrate` as a *separate, reviewed* step before the app rollout.
   Migrations are forward-only and backward-compatible (expand → migrate → contract) so the previous
   app version keeps working during the rollout.
4. Promote the **same image** to prod behind a canary (small % of traffic); watch RED metrics + error
   rate (now accurate — Phase 16 stopped 4xx being mislabeled 5xx) for a bake period.
5. Full rollout on healthy canary; otherwise auto-rollback.

## Rollback
- **App:** redeploy the previous image tag (immutable, always available). No DB change needed because
  migrations are backward-compatible.
- **Migration:** never destructive in the same release as the code that needs it. A bad migration is
  remediated by a new forward migration, not by editing a shipped one.
- **Fast kill switch:** disable a risky code path via a **feature flag** (`libs/core/flags.ts`) without
  a deploy.

## Feature flags for risky paths
Gate anything that touches money, PHI egress, or a new provider behind a flag: EHR write-back, LLM
verification pass, telephony (Phase 17), claim submission (Phase 18). Flags default **off** in prod and
are enabled per-tenant after validation.

## Post-deploy
- Watch dashboards for the bake period; audit-chain integrity check on staging after each migration.
- Any SEV incident → [`compliance/incident-response.md`](./compliance/incident-response.md).
