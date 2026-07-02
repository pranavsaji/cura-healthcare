# Cura — Ambient AI Operations for Behavioral Health

A working scaffold of the Cura platform: AI agents that run
**front-desk (Curadesk)**, **documentation (Curanote)**, and **RCM (Curabill)** inside a
clinic's existing software stack. This repo implements the **Curanote scribe vertical**
end-to-end (record → live transcript → self-writing note → review → EHR sync) on a platform
architected so the other verticals plug in.

Full product/architecture/design spec: **[`plan.md`](./plan.md)**.

## Stack
Nx + pnpm monorepo · TypeScript · React (Vite) · Next.js · Fastify · WebSockets · Drizzle +
Postgres · a shared design-token UI system · pluggable ASR + LLM providers (offline **mocks**
so it runs with **zero API keys**).

```
apps/
  api/        Fastify REST + WebSocket gateway, note generation, providers   (:4100)
  web/        React product app — record, live transcript, note editor        (:5173)
  marketing/  Next.js cinematic landing page                                  (:3100)
libs/
  shared/     Zod domain types + WS contract (note formats, transcript, ...)
  db/         Drizzle Postgres schema (tenancy, sessions, notes, audit, ...)
  ui/         Design tokens (CSS vars) + Tailwind preset + React primitives
```

## Quickstart (no keys, no database needed)

```bash
pnpm install
cp .env.example .env        # optional — mock defaults work without it

# run the API + product app together
pnpm dev
#   API      → http://localhost:4100
#   Product  → http://localhost:5173

# marketing site (separately, or use `pnpm dev:all`)
pnpm dev:marketing          # → http://localhost:3100
```

Then open the product app, start a session, and click **“▶ Play demo session”** — you'll watch
the transcript stream in and the SOAP note write itself, with risk-flag detection and a
one-click **Super Fill** (EHR-sync fallback copies a formatted note to your clipboard).

## How it works
- **Realtime pipeline:** browser → `WSS /ws` → ASR provider → live transcript → on stop, the
  note-generation workflow streams structured, evidence-linked sections back over the socket.
- **Mocks by default:** `ASR_PROVIDER=mock` and `LLM_PROVIDER=mock` make the whole flow work
  offline. Set `deepgram`/`assemblyai` + `anthropic` with keys to swap in real providers
  (see `apps/api/src/providers/`).
- **In-memory store** by default so no Postgres is required for the demo; the Drizzle schema in
  `libs/db` is the production persistence path (`DATABASE_URL` + `pnpm db:migrate`).

## Design system
All colors/spacing/type/motion live as tokens in `libs/ui/src/tokens.css` and a Tailwind preset,
shared by both the product and marketing apps — dark calm-tech surfaces, cream light sections,
sage/mint accents, glassmorphic panels, the animated flow-line, and blur-in reveals.

## Verify
```bash
pnpm typecheck              # all projects
pnpm --filter @cura/web build   # product prod build
```

## Ports
API `4100` · Web `5173` · Marketing `3100` (moved off 4000/3000, which were in use locally).

> Compliance note: this is an architecture demo. PHI handling, WorkOS auth, BAAs, encryption,
> and the audit hash-chain described in `plan.md` are scaffolded but not production-hardened.
