# Phase 05 — Auth & Tenancy (`@cura/auth`)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 03, 04
- **Unblocks:** 06 (API guards), 12 (web auth)

## Objective
Enterprise identity + the tenant/RBAC layer: WorkOS-backed SSO/SCIM + session management, a
`TenantContext` that flows through every request, and RBAC guards enforcing the permission matrix
from Phase 01 — with a **dev fallback** so local work needs no WorkOS account.

## Context you need
- Tech: **WorkOS** (SSO, Directory Sync/SCIM, org management). Roles/permissions defined in
  `@cura/shared/tenant.ts` (Phase 01). Users/orgs persisted via `@cura/db` (Phase 03).
- L2 layer: depends on `shared`, `core`, `db`.
- Read CONVENTIONS §2 (multi-tenant), §6 (min-necessary access).

## Reusability & scalability mandate
- **`TenantContext` is the unit of authorization** everywhere: `{ orgId, userId, role, permissions,
  requestId }`. Every repo call, audit event, log line, and cache key derives from it.
- Auth is transport-agnostic: the same `authenticate(token)` → `TenantContext` works for HTTP
  (Phase 06) and WS (Phase 07).
- Guards are composable and declarative: `requirePermission('notes:sign')`.

## Deliverables
```
libs/auth/src/
  index.ts
  workos.ts             # WorkOS client wrapper: SSO login, callback, SCIM sync
  session.ts            # session issue/verify (JWT or WorkOS sealed session); cookie helpers
  context.ts            # TenantContext type + build from session + org/user lookup
  rbac.ts               # requirePermission/requireRole guards (framework-agnostic predicates)
  dev-auth.ts           # DEV fallback: a seeded org/user context when WORKOS_* unset
  provider.ts           # AuthProvider interface (workos | dev) selected by config
  *.spec.ts
```

## Implementation tasks
1. **AuthProvider interface** with `workos` and `dev` impls; select by presence of `WORKOS_API_KEY`
   (dev fallback returns the seeded org/user from Phase 03's seed).
2. **Session:** issue a signed, short-lived session on login; `verify()` returns claims; secure
   cookie flags (HttpOnly, SameSite, Secure). Refresh flow.
3. **TenantContext builder:** from a verified session, load org + user + role via repos, compute
   `permissions` via the Phase 01 matrix, attach `requestId`.
4. **RBAC guards:** pure predicates + helpers that throw `ForbiddenError` (mapped by Phase 06). Unit
   test every role × permission cell against the matrix.
5. **SCIM/Directory sync (scaffold):** map WorkOS directory users → `users` rows with roles; can be
   stubbed with a contract test now, fully wired later.
6. **Never expose PHI in tokens/cookies;** only ids and role.

## Validation gate
```bash
pnpm --filter @cura/auth test
pnpm typecheck && pnpm lint
```
- **Acceptance:** with `WORKOS_*` unset, `authenticate()` yields the seeded dev `TenantContext`;
  `requirePermission('claims:submit')` throws `ForbiddenError` for a `clinician` and passes for a
  `biller`; a tampered/expired session fails `verify()`; no PHI is present in the session payload.

## Definition of Done
- [ ] `TenantContext` built and threadable through HTTP + WS.
- [ ] RBAC guards enforce the full matrix (tested per cell).
- [ ] Dev fallback works with zero WorkOS config; real WorkOS path implemented behind the interface.
- [ ] Sessions are secure; no PHI in tokens.

## Handoff notes
Implemented as `@cura/auth` (L2, deps: shared/core/db). Validation gate green:
`pnpm --filter @cura/auth test` (87 tests), `pnpm typecheck`, `pnpm lint`. Auth src coverage ≈99%.

- **Session mechanism:** stateless **HS256 JWT** signed with an HMAC secret (node:crypto, no vendor
  SDK). `SessionService.issue(subject)` / `verify(token)`. Claims are ids + role + `iat/exp/sid`
  only — **no PHI**. Verification is constant-time and rejects tampered/expired/wrong-secret tokens.
- **Secret:** `SESSION_SECRET` (new config var, ≥16 chars, redacted). Optional in dev (the API falls
  back to `ENCRYPTION_KEY`); **required in production** (config cross-field rule + `config.spec`).
- **Cookie:** name `cura_session` (`DEFAULT_COOKIE_NAME`), flags `HttpOnly; Path=/; SameSite=Lax;
  Max-Age=<ttl>` and `Secure` when `secureCookies` is set (prod). Helpers: `toSetCookie`,
  `clearCookie`, `readCookie`. Bearer helper: `readBearer(authorization)`.
- **How Phase 06/07 get a TenantContext:** `AuthService.authenticate(token | null, requestId)` →
  `TenantContext`. Same call works for HTTP (cookie/bearer) and WS (upgrade). With no token AND a dev
  provider, it returns the **seeded dev context** (local dev/tests). Build a service with
  `createAuthService({ sessionSecret, repos, provider? })`.
- **TenantContext builder** (`buildTenantContext`) re-loads org + user from repos and derives
  `permissions` from the Phase 01 matrix. **DB role is the source of truth** — the token's `role`
  claim is ignored, so role changes/revocations take effect immediately. Throws `AuthError` (401) if
  org/user missing or mismatched.
- **RBAC:** `requirePermission(p)`, `requireRole(...r)`, `assertPermission/assertRole`,
  `hasPermission/hasRole` — pure predicates throwing `ForbiddenError` (403). Full role×permission
  matrix is tested per cell (64 cells).
- **Providers** (`AuthProvider`, selected by `AUTH_PROVIDER`): `DevAuthProvider` (seeded subject,
  default = seeded **admin** so all routes are usable locally) and `WorkOSAuthProvider` (SSO
  `authorizationUrl`/`completeLogin` + SCIM `syncDirectoryUser`, idempotent by external id). WorkOS
  talks only to a `WorkOSPort` (vendor boundary); `HttpWorkOSPort` is the real fetch impl, tested via
  a stubbed `fetch`. A contract test asserts both providers satisfy their advertised surface.
