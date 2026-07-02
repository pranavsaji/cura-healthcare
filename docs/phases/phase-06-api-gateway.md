# Phase 06 — API Gateway (`apps/api`, Fastify)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 04, 05
- **Unblocks:** 07, 10, 11, 13, 14

## Objective
Turn the demo Fastify app into a real API gateway: a plugin architecture with request context,
auth, zod validation, the error-taxonomy handler, rate limiting, OpenAPI docs, health/readiness,
and graceful shutdown. Routes stay thin; capability lives in libs.

## Context you need
- Demo exists (`apps/api/src/{main,routes,realtime}.ts`) with CORS + WS + in-memory store. Harden
  into a structured, tested gateway using `@cura/core` (config/logger), `@cura/auth`
  (TenantContext), `@cura/db` (repos).
- L4 app. Read CONVENTIONS §3 (validate at boundary, typed errors), §5 (API tests).

## Reusability & scalability mandate
- **Per-request `TenantContext`** decorated on the Fastify request; every handler uses it; every log
  line + audit event derives from it.
- Cross-cutting concerns are **plugins** (auth, error handler, request-id, rate-limit, metrics) so
  they compose and are reused by future apps.
- Handlers delegate to `libs/*` services — no business logic in routes.

## Deliverables
```
apps/api/src/
  main.ts                    # bootstrap: config, plugins, routes, graceful shutdown
  app.ts                     # buildApp() returning a configured Fastify instance (testable)
  plugins/
    request-context.ts       # requestId, logger child, timing
    auth.ts                  # verify session → TenantContext (from @cura/auth)
    error-handler.ts         # AppError → toHttp(); zod → 400; catch-all → 500 (no PHI)
    rate-limit.ts            # per-org/user limits (Redis-backed)
    openapi.ts               # swagger/scalar from zod schemas
    metrics.ts               # OTel/prom hooks (Phase 14 consumes)
  routes/
    health.ts  sessions.ts  notes.ts  templates.ts  integrations.ts  agent-runs.ts
  services/                  # thin orchestration calling libs (or import from libs directly)
  test/                      # fastify.inject API tests per route
```

## Implementation tasks
1. **`buildApp()`** factory (separate from `listen`) so tests use `fastify.inject` without a socket.
2. **Plugins:** request-context (+ trace id), auth (attaches `TenantContext`, 401 on missing/invalid),
   error-handler (maps `AppError` + zod + unknown; logs full internally, returns safe body),
   rate-limit (Redis; per-org+user; `429` with `RateLimitError`).
3. **Zod validation** on every route (params/query/body) via a shared `validate()` helper; reject
   with `ValidationError`.
4. **Routes** (port from demo, now tenant-scoped + audited): sessions CRUD + consent + generate;
   notes get/edit/sign/sync; templates; integrations connect; agent-runs read (for Phase 14).
   Every mutation writes an `audit_events` row via `@cura/audit`.
5. **OpenAPI** generated from schemas; served at `/docs`.
6. **Health/readiness:** `/health` (liveness) + `/ready` (DB/Redis reachable). Graceful shutdown
   drains connections.

## Validation gate
```bash
pnpm --filter @cura/api test        # fastify.inject route tests
pnpm --filter @cura/api typecheck
# manual smoke:
pnpm --filter @cura/api dev & sleep 3
curl -s localhost:4100/health && curl -s localhost:4100/ready
```
- **Acceptance:** unauthenticated request to a protected route → `401` with `{code:'unauthorized'}`
  and no stack; malformed body → `400` `{code:'validation_error'}`; a `clinician` hitting a
  biller-only route → `403`; every mutation appears in `audit_events`; `/docs` renders the schema;
  exceeding the rate limit → `429`.

## Definition of Done
- [ ] `buildApp()` is unit/inject-testable; route tests green.
- [ ] Auth, error, rate-limit, request-context plugins active + tested.
- [ ] All mutations audited; no PHI in error bodies or logs.
- [ ] OpenAPI served; health + readiness + graceful shutdown work.

## Handoff notes
Gateway rebuilt on a **Platform** abstraction. Validation gate green:
`pnpm --filter @cura/api typecheck`, 17 `fastify.inject` tests (`test/api.spec.ts`, `test/auth.spec.ts`),
`pnpm lint`, and the manual smoke (`/health`, `/ready`, `/docs`→200, `/openapi.json`).

- **Platform** (`src/platform/*`): everything resolved once at boot and read off `app.platform`.
  `createMemoryPlatform()` (dev/tests: in-memory store/audit/rate-limit + dev auth) and
  `createPostgresPlatform(config)` (PG stores + audit, Redis rate-limit w/ in-memory fallback, WorkOS
  or dev auth). Selected by `DATABASE_URL`. `Platform.ready()` powers `/ready`; `shutdown()` drains.
- **Tenant scoping:** `StoreFactory.forTenant({orgId,userId})` yields a store bound to the request's
  org — no handler can touch another tenant. `MemoryStoreFactory` keeps one dataset per org.
- **Plugin order** (all `fastify-plugin`, so hooks/decorators are global):
  `error-handler → request-context → cors → websocket → auth → rate-limit → metrics → openapi`, then
  routes. `buildApp(platform, { realtime? })` is inject-testable; `main.ts` only adds `listen` +
  graceful shutdown (SIGTERM/SIGINT).
- **Auth contract for the web app:** send the session either as `Cookie: cura_session=<jwt>` (set by
  `POST /auth/dev-login` or `GET /auth/callback`, HttpOnly) **or** `Authorization: Bearer <jwt>`. CORS
  is credentialed to `WEB_ORIGIN`. `GET /auth/me` returns `{orgId,userId,role,permissions}` (no PHI).
  Routes are protected by default; mark public with `config: { public: true }`. Missing/invalid token
  → `401`; in dev the fallback authenticates the seeded admin so no login is needed locally.
- **Errors:** single `setErrorHandler` maps `AppError` + zod/Fastify validation (`400
  validation_error` with safe field details) + unknown (`500`, no leak). `setNotFoundHandler` → typed
  `404`. Full error logged internally via `toLogSafe` (PHI-safe).
- **Rate limit:** fixed-window, key `org:user` (or `ip:*` pre-auth), default `RATE_LIMIT_PER_MIN=120`,
  60s window. Emits `X-RateLimit-*` + `Retry-After`; over limit → `429 rate_limited`.
- **Audit:** every mutation writes an `audit_events` row via `@cura/audit`; readable at
  `GET /agent-runs` (requires `audit:read`) — the Phase 14 data source.
- **OpenAPI:** generated from the zod route schemas via `fastify-type-provider-zod` +
  `@fastify/swagger`. UI at **`/docs`**, raw spec at **`/openapi.json`**.
- **New config:** `SESSION_SECRET` (see Phase 05), `WORKOS_REDIRECT_URI`. `resolveConfig()` coerces
  empty-string env vars to unset (so `DATABASE_URL=` means in-memory) and injects dev secret fallbacks
  outside production.
- **New deps:** `@fastify/swagger`, `@fastify/swagger-ui`, `fastify-type-provider-zod@^3` (zod 3),
  `fastify-plugin`, `ioredis`. **New db repo methods** (for WorkOS SCIM): `OrgRepo.byWorkosOrgId`,
  `UserRepo.byWorkosUserId`, `UserRepo.updateRole`.
- **Removed** demo `src/routes.ts` + `src/realtime.ts` (superseded); `src/store/index.ts` trimmed.
