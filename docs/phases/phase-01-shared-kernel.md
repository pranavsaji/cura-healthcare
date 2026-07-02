# Phase 01 — Shared Kernel (`@cura/shared`)

- **Status:** ✅ DONE
- **Owner:** _implemented_
- **Depends on:** 00
- **Unblocks:** 02, 03, 04, and everything downstream

## Objective
Establish the **L0 domain contract**: zod schemas + inferred types for every core concept, the
error taxonomy, shared result/branded types, and the WebSocket message contract. This is the single
source of truth both the backend and frontend import so they can never disagree on shape.

## Context you need
- L0 layer: **zero runtime deps except `zod`.** Browser- and server-safe. No I/O, no Node APIs.
- A demo version exists (`libs/shared/src/{notes,sessions,templates,realtime}.ts`). This phase
  hardens it into the canonical contract with tests and the error taxonomy.
- Read CONVENTIONS §3 (types/errors), §4 (naming).

## Reusability & scalability mandate
- These types are consumed by all three verticals — keep them **domain-general** where shared
  (e.g. `AuditEvent`, `Tenant`, `Paginated<T>`) and vertical-specific where not (`notes.ts`).
- Every externally-received shape has a zod schema so callers parse, not cast.

## Deliverables
```
libs/shared/src/
  index.ts                 # barrel
  errors.ts                # AppError taxonomy (+ toHttp())
  result.ts                # Result<T,E> helpers for expected-failure flows
  ids.ts                   # branded id types (OrgId, SessionId, NoteId, ...)
  pagination.ts            # Paginated<T>, cursor helpers
  tenant.ts                # Tenant, Role, Permission enums
  audit.ts                 # AuditAction enum + AuditEvent schema
  templates.ts             # note formats, sections, presets (exists — keep/expand)
  sessions.ts              # session/status/source (exists)
  notes.ts                 # note/section/risk/transcript (exists)
  realtime.ts              # Client/Server WS discriminated unions (exists)
  *.spec.ts                # unit tests for every schema (valid + invalid cases)
```

## Implementation tasks
1. **Error taxonomy (`errors.ts`):** `AppError` base with `code`, `httpStatus`, `safeMessage`;
   subclasses `ValidationError`, `NotFoundError`, `AuthError`, `ForbiddenError`, `ConflictError`,
   `ProviderError`, `RateLimitError`, `InternalError`. Add `toHttp(err)` → `{ status, body }` with
   **no PHI/stack** in `body`. Unit-test the mapping.
2. **Result type (`result.ts`):** `ok(v)`, `err(e)`, `isOk`, `map`, `unwrapOr` — for provider/EHR
   flows where both branches are expected (CONVENTIONS §3).
3. **Branded ids (`ids.ts`):** nominal types to prevent mixing a `SessionId` with a `NoteId`.
4. **Tenant/RBAC (`tenant.ts`):** `Role` (`owner|admin|clinician|frontdesk|biller`), `Permission`
   union, and a `can(role, permission)` matrix (pure, tested). Consumed by Phase 05.
5. **Audit (`audit.ts`):** `AuditAction` enum + `AuditEvent` schema matching the DB (Phase 03).
6. **Harden existing schemas:** ensure `notes/sessions/templates/realtime` parse round-trip; add
   invalid-input tests; export inferred types only through the barrel.
7. **Pagination:** `Paginated<T>` + cursor encode/decode used by list endpoints.

## Validation gate
```bash
pnpm --filter @cura/shared test        # every schema has valid+invalid unit tests
pnpm --filter @cura/shared typecheck
pnpm lint
```
- **Acceptance:** `toHttp(new NotFoundError('note'))` → `{ status: 404, body:{ code:'not_found' }}`
  with no leaked internals. `can('clinician','claims:submit')` → `false`; `can('biller',
  'claims:submit')` → `true`. Feeding a malformed `ServerMessage` to its schema throws a
  `ValidationError`-mappable zod error.

## Definition of Done
- [ ] All schemas have valid + invalid unit tests; coverage ≥ 80%.
- [ ] Error taxonomy maps to HTTP without leaking PHI/stacks.
- [ ] RBAC matrix + Result + branded ids exported and tested.
- [ ] No import outside `zod`.

## Handoff notes (implemented)
- **Modules (all barrel-exported from `@cura/shared`):** `errors` (AppError taxonomy + `toHttp`),
  `result` (`Result<T,E>` + helpers), `ids` (branded `OrgId/UserId/ClientId/SessionId/TranscriptId/
  NoteId/TemplateId` + `asX` wrappers), `pagination` (`Paginated<T>`, `PageQuery`, cursor codec),
  `tenant` (`Role`, `Permission`, `can()`, `permissionsFor()`, `TenantContext`), `audit`
  (`AuditAction`, `AuditEvent`, `AuditInput`) — plus the existing `templates/sessions/notes/realtime`.
- **Errors:** subclasses set `code` + `httpStatus`; `safeMessage` is the only client-visible text.
  `toHttp(unknown)` maps AppErrors and collapses everything else to a generic 500 (proven not to
  leak PHI/stack). Phase 06's error handler should call `toHttp`.
- **RBAC:** matrix in `tenant.ts`. Confirmed `can('clinician','claims:submit')===false`,
  `can('biller','claims:submit')===true`. `owner` = all permissions. Phase 05 builds `TenantContext`
  from a role via `permissionsFor()`.
- **Id branding** is compile-time only (unique-symbol brand); values are plain strings at runtime.
- **Schema versioning:** not added yet — when persisting note/template JSON long-term (Phase 03/11),
  add a `schemaVersion` field and a migration path. Flagged for Phase 03.
- **Testing:** shared specs use **inline fixtures** (must not import `@cura/testing` — L0 + cycle).
  Coverage: shared 100% lines. `AuditEvent` mirrors the `audit_events` table (Phase 03/04).
- **Gate result:** `pnpm verify` green — 38 tests, typecheck clean, lint clean.
