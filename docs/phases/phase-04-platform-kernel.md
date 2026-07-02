# Phase 04 — Platform Kernel (`@cura/core`, `@cura/audit`)

- **Status:** ✅ DONE
- **Owner:** _implemented_
- **Depends on:** 00, 01
- **Unblocks:** 05, 06, 08, 09, 13

## Objective
The reusable runtime backbone every app/service shares: validated config, structured PHI-redacting
logging, id/clock abstractions, retry/backoff, feature flags — plus the **hash-chained audit log**
that makes every PHI-touching action tamper-evident and replayable ("healthcare-grade
observability").

## Context you need
- L1/L2 layer. `core` depends only on `shared`; `audit` depends on `shared`, `core`, `db`.
- These are cross-cutting: do NOT put vertical logic here. Just capabilities.
- Read CONVENTIONS §2, §3, §6.

## Reusability & scalability mandate
- **Config validated once at boot** with zod; a missing/invalid env fails fast with a clear message.
  Everything reads config from here — no `process.env` scattered in features.
- **Clock + IdGen are injectable** so all downstream logic is deterministically testable.
- Audit is a **single reusable helper** (`audit.record(ctx, action, resource, meta)`) used
  identically by all three verticals.

## Deliverables
```
libs/core/src/
  config.ts        # zod-validated env → typed config object; loadConfig()
  logger.ts        # pino wrapper; PHI redaction; request/trace correlation ids
  ids.ts           # IdGen interface + uuid impl + deterministic test impl
  clock.ts         # Clock interface + system + fake
  retry.ts         # retry/backoff with jitter; typed give-up
  flags.ts         # feature flags (env/db backed); typed accessors
  errors.ts        # re-export + toLogSafe(err)
  index.ts
  *.spec.ts
libs/audit/src/
  index.ts
  audit.ts         # record(), verifyChain(), replay() over audit_events
  hash.ts          # canonical serialization + hash chaining (prevHash → hash)
  *.spec.ts        # unit (hash chain) + int (persists via @cura/db)
```

## Implementation tasks
1. **Config:** define the full env schema (DB, WorkOS, ASR, LLM, storage, Redis, ports, limits);
   `loadConfig()` parses `process.env`, applies defaults, and throws a readable aggregate error on
   invalid config. Redact secrets in any debug print.
2. **Logger:** pino base with a redaction list (PHI fields, tokens, auth headers); child loggers
   carry `orgId`, `requestId`, `traceId`. Provide `logger.child(ctx)`.
3. **Clock/IdGen:** interfaces + system impls + test impls (from/aligned with `@cura/testing`).
4. **Retry:** generic `withRetry(fn, policy)` with exponential backoff + jitter and a typed
   `RetryError`; used by providers (08/09) and EHR (13).
5. **Audit hash chain:** `record()` computes `hash = H(canonical(event) + prevHash)`, stores via
   `audit-repo`; `verifyChain(orgId)` recomputes and detects tampering; `replay()` returns ordered
   events for the run inspector (Phase 14).
6. **Flags:** typed feature flags with env + optional DB override; default-off for risky paths.

## Validation gate
```bash
pnpm --filter @cura/core test
pnpm --filter @cura/audit test          # includes Testcontainers integration
pnpm typecheck && pnpm lint
```
- **Acceptance:** `loadConfig()` throws listing every missing var when env is empty; a log line
  containing a PHI-shaped field is redacted; tampering with one stored audit row makes
  `verifyChain()` fail at exactly that row; `withRetry` retries N times then returns a typed give-up.

## Definition of Done
- [ ] Config fails fast + readable; no stray `process.env` elsewhere (lint check).
- [ ] Logger redacts PHI/secrets (tested).
- [ ] Clock/IdGen injectable and used by later phases.
- [ ] Audit chain records, verifies, and detects tampering (unit + integration).

## Handoff notes (implemented)
- **Packages:** `@cura/core` (L1, deps: `@cura/shared`, `pino`, `zod`) and `@cura/audit` (L2, deps:
  `@cura/shared`, `@cura/core`, `@cura/db`).
- **Config (`config.ts`):** `loadConfig(env=process.env)` → typed `Config`, throwing `ConfigError`
  that lists **every** invalid var (no values echoed). `ENCRYPTION_KEY` is the one required-no-default
  (crypto key, ≥16 chars) so an empty env fails fast. Provider secrets are conditionally required via
  `superRefine` (`ANTHROPIC_API_KEY` when `LLM_PROVIDER=anthropic`, `ASR_API_KEY` when ASR≠mock,
  WorkOS pair when `AUTH_PROVIDER=workos`, `DATABASE_URL` in production). `redactConfig()` masks the
  secret set for safe debug printing.
- **Logger (`logger.ts`):** pino with `redact` covering PHI fields (`mrn`, `displayLabel`,
  `clientLabel`, `content`, `text`, `transcript`, `segments`, `audio`, `quote`) + secrets/auth
  headers, at top level, `*.field`, and `req.headers.*`. `createLogger({ destination })` accepts an
  injectable sink for tests; `childLogger(base, { orgId, requestId, traceId })` for correlation.
  `toLogSafe(err)` (in `errors.ts`) yields `{ code, httpStatus, message }` for AppErrors and a generic
  `internal_error` for unknown throws (no PHI leak).
- **Clock/IdGen:** `systemClock`/`FixedClock` (`now/nowMs/nowIso`) and `uuidIdGen`/`fixedIdGen`
  (`next(prefix?)`) — structurally compatible with `@cura/testing`. Injected into repos + audit.
- **Retry:** `withRetry(fn, policy)` — exponential backoff + symmetric jitter, injectable
  `sleep`/`random` for deterministic tests, typed `RetryError` (extends `ProviderError`) after
  exhaustion; `retryable` predicate short-circuits non-transient errors.
- **Flags:** `createFlags(config.FEATURE_FLAGS)` over a typed registry (`FLAG_DEFAULTS`); `!name`
  disables a default-on flag; unknown names throw. Risky paths default off.
- **Audit hash chain:** `createAuditLog({ store, clock?, ids? })`. `hash = SHA-256( canonical(event) |
  prevHash )` where `canonical` is recursively key-sorted JSON of
  `{id,orgId,actor,action,resource,phiTouched,context,createdAt}` (excludes `prevHash`/`hash`).
  `record()` reads the org's chain head via `store.lastHash`, links + hashes, persists. `verifyChain`
  recomputes each link and returns the **first** break with `{brokenAt, brokenId, reason}` where
  reason ∈ `hash_mismatch | chain_broken`. `replay` returns ordered events. `AuditStore` is a
  structural interface — `@cura/db`'s `AuditRepo` satisfies it; unit tests use an in-memory fake.
  Audit ids are DB-owned uuids (`ids.next()` bare), so the hash includes the uuid.
- **Gate:** `pnpm verify` green (typecheck + lint + unit). Integration (`test:int`, Docker):
  `libs/audit/test/audit.int.spec.ts` proves a SQL-level tamper is caught at the exact row.
