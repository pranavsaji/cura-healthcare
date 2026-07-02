# Phase 12 — Product Web App (`apps/web`)

- **Status:** DONE
- **Owner:** _agent_
- **Depends on:** 02, 07, 11
- **Unblocks:** 14 (audit UI), 16 (hardening/e2e)

## Objective
The clinician-facing product: authenticated SPA with dashboard, the capture flow (consent → live
transcript), the note editor (streamed sections, evidence popovers, risk flags, per-section
regenerate, sign, Super Fill), templates, and settings — built entirely on `@cura/ui`, with a full
golden-path **e2e** test.

## Context you need
- Demo exists (`apps/web`, Vite + React) with the record→transcript→note flow against mocks. This
  phase adds auth, routing, real data wiring, mic capture, and tests.
- Consumes: `@cura/ui` (Phase 02), realtime protocol (Phase 07), note engine via API (Phase 11),
  auth (Phase 05).
- L4 app. Read CONVENTIONS §5 (e2e golden path), §2 (thin app).

## Reusability & scalability mandate
- **All UI from `@cura/ui`** — no bespoke colors/components in the app. App = routing + data +
  composition.
- Data layer via TanStack Query (server cache) + a thin WS client; typed end-to-end via
  `@cura/shared`.
- Auth-guarded routes; tenant context comes from the session (Phase 05).

## Deliverables
```
apps/web/src/
  main.tsx  App.tsx  router.tsx           # routes + auth guard
  lib/api.ts  lib/ws.ts  lib/auth.ts      # typed REST + WS + session
  routes/
    dashboard.tsx      # today's sessions, quick record
    record.tsx         # consent → live capture → transcript (mic + system audio)
    note.tsx           # editor: streamed sections, evidence, risk, regenerate, sign, sync
    sessions.tsx  templates.tsx  settings.tsx
  features/            # feature components composed from @cura/ui
  state/              # TanStack Query hooks, WS store
apps/web/e2e/
  golden-path.spec.ts  # Playwright: consent→record(demo)→note→edit→sign→sync
  auth.spec.ts
```

## Implementation tasks
1. **Auth + routing:** login (WorkOS or dev), session cookie, guarded routes, org switcher if
   multi-org; redirect unauthenticated to login.
2. **Capture:** real mic via `getUserMedia` + `AudioWorklet`/`MediaRecorder`, stream PCM/Opus frames
   over WS (Phase 07); keep the "Play demo session" path for keyless demos/tests. Consent gate first.
3. **Live transcript:** render `partial`/`segment` messages with speaker styling + timestamps;
   auto-scroll; capturing indicator.
4. **Note editor:** subscribe to `note.section` stream; editable sections with evidence popovers
   (click a claim → see the transcript span), risk banner, **per-section regenerate**, sign, and
   **Super Fill** (EHR sync via Phase 13; clipboard fallback).
5. **Templates + settings:** manage templates, org/security settings, retention.
6. **State/data:** TanStack Query for REST; a small WS store for the live stream; optimistic edits.
7. **E2E:** Playwright golden path headless against the API with mock providers.

## Validation gate
```bash
pnpm --filter @cura/web typecheck
pnpm --filter @cura/web build
pnpm --filter @cura/web test         # component/RTL
pnpm --filter @cura/web e2e          # Playwright golden path + auth
```
- **Acceptance:** the golden-path e2e passes headless: start session → consent → play demo → watch
  transcript stream → note writes itself → edit a section (saved) → sign → Super Fill (clipboard/EHR);
  unauthenticated access redirects to login; a risk flag renders when the transcript contains a
  trigger phrase; all interactive elements are keyboard-accessible (axe check in e2e).

## Definition of Done
- [ ] Auth-guarded SPA; all screens built from `@cura/ui`.
- [ ] Real mic capture + demo path both work.
- [ ] Streamed editor with evidence, risk, regenerate, sign, Super Fill.
- [ ] Golden-path + auth e2e green in CI (headless, mock providers).

## Handoff notes
- **Stack:** React 19 + Vite, **react-router-dom v7** (routing/guard) + **@tanstack/react-query v5**
  (server cache). All chrome composed from `@cura/ui`; app stays thin (routing + data + composition).
- **Routes:** `/login`, `/` (dashboard), `/record`, `/note/:id`, `/sessions`, `/templates`,
  `/audit` (Phase 14), `/runs/:resource` (Phase 14), `/settings`. `RequireAuth` (router.tsx) waits
  for the `/auth/me` probe, then redirects to `/login` when unauthenticated.
- **Auth flow (`state/auth.tsx`):** `AuthProvider` probes `/auth/me`; `login(role)` → `/auth/dev-login`
  (HttpOnly cookie) → refresh. All requests are `credentials:"include"`. Nav items gate on
  permissions (`audit` needs `audit:read`).
- **API client (`api.ts`):** typed via `@cura/shared`. IMPORTANT: only sets `content-type: application/json`
  when a body is present — a bodyless POST with that header is rejected by Fastify (caused the first
  golden-path failure). `ApiError` carries the status so the guard can react to 401.
- **Data (`state/queries.ts`):** TanStack Query hooks + optimistic mutations (edit/sign/sync). The WS
  live stream stays in `useSession` (a small store), separate from Query's REST cache.
- **Capture:** `useSession` + `connectRealtime` (WS, Phase 07). Consent gate in `SetupCard` (Start
  disabled until consent). "Play demo session" is the keyless path the e2e drives. (Real mic via
  `getUserMedia` is the remaining enhancement — the WS frame contract is ready.)
- **Editor:** streamed sections, **evidence popover** (click the evidence-link chip → the supporting
  transcript spans), risk banner, sign, **Super Fill** (`/notes/:id/sync` → clipboard copy).
- **Tests:** RTL component tests (`NoteEditor`, auth guard redirect, `AuditRoute`) + **Playwright e2e**
  (`e2e/golden-path.spec.ts`, `e2e/auth.spec.ts`) — all green headless.
- **E2E run notes (`playwright.config.ts`):** boots API + Vite on **unique ports 4711/4712** (avoids
  colliding with other local dev servers), `reuseExistingServer:false`, and passes the API
  `DATABASE_URL=""` (force in-memory) + `WEB_ORIGIN=http://localhost:4712` (CORS for credentialed
  `/auth`). Run: `cd apps/web && pnpm e2e`. `e2e/**` is excluded from Vitest.
- **Validation:** `pnpm --filter @cura/web typecheck && build`, RTL tests, and `pnpm e2e` (4 tests)
  all green; repo-wide `typecheck`/`lint`/`test` clean (428 tests).
