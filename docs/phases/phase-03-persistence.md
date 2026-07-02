# Phase 03 — Persistence (`@cura/db`, Drizzle + Postgres)

- **Status:** ✅ DONE
- **Owner:** _implemented_
- **Depends on:** 00, 01
- **Unblocks:** 05, 06, 10, 11, 13

## Objective
A real, multi-tenant persistence layer: the Drizzle schema, forward-only migrations, and a set of
**repositories** (tenant-scoped query helpers) that the rest of the system uses instead of touching
Drizzle directly. Integration-tested against a real Postgres via Testcontainers.

## Context you need
- The demo schema exists (`libs/db/src/schema.ts`) and generates valid SQL. This phase adds
  **repositories, tenant scoping, migrations discipline, seeds, encryption hooks, and tests.**
- The API currently uses an in-memory store (`apps/api/src/store.ts`). This phase provides the
  Postgres-backed implementation the store interface can delegate to.
- L2 layer: depends on `shared`, `core`. Read CONVENTIONS §2 (tenancy), §6 (PHI).

## Reusability & scalability mandate
- **No raw Drizzle in apps.** Apps/services call repositories (`SessionRepo`, `NoteRepo`, …). Every
  repo method takes a `TenantContext` (or `orgId`) and **cannot** run unscoped — enforce in code.
- Consider Postgres **Row-Level Security** as defense-in-depth (policy per table keyed on a
  `current_setting('app.org_id')`), set per transaction.
- Repositories return domain types from `@cura/shared`, not Drizzle row types, so callers are
  decoupled from the ORM.

## Deliverables
```
libs/db/src/
  schema.ts                # tables (exists — extend: claims/calls when verticals land)
  client.ts                # createDb(), pool config (exists)
  repositories/
    base.ts                # tenant-scoped query helpers, RLS session setter
    session-repo.ts  note-repo.ts  template-repo.ts  transcript-repo.ts
    audit-repo.ts    org-repo.ts   user-repo.ts   client-repo.ts
  encryption.ts            # envelope encrypt/decrypt for PII columns (KMS-pluggable, mock in dev)
  seed.ts                  # dev seed: 1 org, users, default templates
  migrate.ts               # runner (exists)
  index.ts
libs/db/drizzle/           # generated migrations (forward-only)
libs/db/test/
  *.int.spec.ts            # Testcontainers Postgres: CRUD, tenant isolation, RLS
```

## Implementation tasks
1. **Repositories:** implement per-aggregate repos with tenant scoping baked in; `base.ts` provides
   `withTenant(orgId)` that sets `app.org_id` on the connection/transaction.
2. **Tenant isolation test:** create two orgs, write rows in each, assert org A can never read org
   B's rows through any repo method (this is the most important test in the phase).
3. **Encryption hooks:** `encryption.ts` wraps PII columns; KMS interface with a dev `mock` (static
   key) and a real provider slot. Repos encrypt on write / decrypt on read for PII fields.
4. **Migrations:** `pnpm db:generate` from schema; commit SQL; `migrate.ts` applies. Document the
   forward-only rule.
5. **Seed:** deterministic dev seed (fixed ids via `@cura/testing`) so other phases/e2e have data.
6. **Wire the API:** provide a `PostgresStore` implementing the same interface as the in-memory
   `store.ts`, selected when `DATABASE_URL` is set (keep in-memory for offline dev/tests default).

## Validation gate
```bash
# integration tests spin up a real Postgres container
pnpm --filter @cura/db test:int
pnpm --filter @cura/db typecheck
pnpm db:generate && git diff --exit-code libs/db/drizzle   # schema ↔ migrations in sync
```
- **Acceptance:** cross-tenant read returns nothing (isolation proven); a PII column is ciphertext
  at rest (raw SQL select shows encrypted bytes) but plaintext through the repo; migrations are in
  sync with the schema (no uncommitted drift).

## Definition of Done
- [ ] All repos tenant-scoped; unscoped access is impossible by construction.
- [ ] Tenant-isolation + encryption integration tests pass on real Postgres.
- [ ] Migrations committed and in sync; seed produces a usable dev org.
- [ ] API can run on Postgres when `DATABASE_URL` set; in-memory still works for tests.

## Handoff notes (implemented)
- **Repositories (`libs/db/src/repositories/`):** `OrgRepo`, `UserRepo`, `ClientRepo`,
  `TemplateRepo`, `SessionRepo`, `TranscriptRepo`, `NoteRepo`, `AuditRepo`, all extending `BaseRepo`.
  Every method (except org create/byId, since orgs *are* tenants) takes `orgId` as its first arg and
  filters on it — **unscoped access is impossible by construction**. Repos return `@cura/shared`
  domain types (zod-`parse`d enums on read), never Drizzle rows. `createRepositories(db, { clock?,
  ids?, encryptor? | encryptionKey? })` wires the set with injected deps (system clock + uuid ids by
  default).
- **Tenant isolation:** enforced in code (primary guarantee, proven by
  `repositories.int.spec.ts` — org A can't read org B by list or by id). `BaseRepo.withTenant(orgId,
  fn)` additionally sets the `app.org_id` GUC per transaction as an RLS hook (policies are optional
  defense-in-depth; not required for isolation and **off by default** since the default Postgres
  superuser bypasses RLS anyway).
- **Encryption (`encryption.ts`):** AES-256-GCM envelope encryption for PII. `KeyProvider` interface
  (KMS-pluggable); dev/test uses `staticKeyProvider(passphrase)` deriving a 32-byte key via SHA-256.
  Ciphertext format `v1.<iv>.<tag>.<ct>` (base64url) is self-describing + authenticated (tamper →
  throw). `ClientRepo` encrypts `displayLabel`/`mrn` on write, decrypts on read; raw SQL shows
  `v1.…` ciphertext (proven in the int test).
- **Seed (`seed.ts`):** `seed(db, encryptionKey)` writes one org, admin+clinician, two clients, and a
  default template per format (SOAP = default). Deterministic UUIDs in `SEED_IDS` for cross-phase
  references. Uses `FixedClock` + `fixedIdGen`.
- **Store swap:** `Store` interface + `PostgresStore` live in `@cura/db` (`store.ts`); the API's
  `MemoryStore` (`apps/api/src/store/memory-store.ts`) implements the same async contract. The store
  is **async** and **tenant-bound at construction**. Note ids/timestamps are store-owned (call
  `createNote`, never fabricate an id — Postgres uses uuid). `apps/api/src/store/index.ts`
  `createStore()` selects Postgres when `DATABASE_URL` is set (seeding a dev org on first boot),
  else in-memory. API routes/realtime/notegen were refactored to inject the store + await.
- **Migrations:** unchanged (`0000_hard_fixer.sql`); `pnpm db:generate` reports "nothing to migrate"
  (schema ↔ migration in sync). Forward-only; never edit a shipped migration.
- **Local DB reset:** drop/recreate the database (or use a throwaway Testcontainers PG), then
  `pnpm db:migrate` and call `seed()`.
- **Testing:** unit `encryption.spec.ts`. Integration (`test:int`, Docker via Testcontainers):
  `repositories.int.spec.ts` (isolation + encryption-at-rest + seed) and `store.int.spec.ts`
  (full PostgresStore flow). Shared container helper exported at `@cura/db/testing` (`startTestDb`).
  Pool: `postgres({ max: 10 })` in `createDb`.
