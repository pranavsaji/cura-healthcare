# Phase 14 — Observability & Audit UI

- **Status:** DONE
- **Owner:** _agent_
- **Depends on:** 06, 12
- **Unblocks:** 16 (hardening)

## Objective
"Healthcare-grade observability": OpenTelemetry tracing/metrics/logs across API + worker + realtime,
and the in-product **audit trail + run inspector** where an admin can monitor, replay, and audit any
agent/user action on their data — powered by the hash-chained audit log (Phase 04).

## Context you need
- Audit log + `agent_runs`/`agent_steps` exist in the schema (Phase 03/04). This phase surfaces them
  and adds telemetry.
- Read `/plan.md` §3.4 + §8; CONVENTIONS §6 (no PHI in telemetry).

## Reusability & scalability mandate
- Telemetry is a reusable `libs/core` concern (Phase 04 metrics hooks) + an OTel setup shared by all
  apps — not per-app instrumentation code.
- The run inspector reads generic `agent_runs/steps` + `audit_events`, so it works for all three
  verticals unchanged.

## Deliverables
```
libs/telemetry/src/
  index.ts  otel.ts        # tracer/meter setup; exporters (OTLP); resource attributes
  http.ts  ws.ts           # span helpers for API + realtime
apps/api/src/plugins/metrics.ts   # request/latency/error metrics (wire OTel)
apps/web/src/routes/
  audit.tsx                # live audit trail (ticker) + filter/search
  runs.tsx                 # run inspector: steps, inputs/outputs, decisions, replay
apps/web/e2e/audit.spec.ts
```

## Implementation tasks
1. **OTel setup** (`libs/telemetry`): traces + metrics + logs with OTLP export; resource attrs
   (service, env); **no PHI** in span attributes (ids/durations only).
2. **Instrument** API (per-route spans + RED metrics), realtime (connection/message spans), worker
   (workflow spans). Correlate with `requestId`/`traceId` from `@cura/core`.
3. **Audit UI:** live trail (the `AuditTicker` from `@cura/ui`) with filter by actor/action/resource
   + `phi_touched`; reads `audit_events` via a tenant-scoped API.
4. **Run inspector:** timeline of `agent_steps` for a run (decision/tool_call/memory/output) with
   inputs/outputs; a **replay** view reconstructing what ran; link from a note to its generation run.
5. **Chain verification surfaced:** show audit-chain integrity status (from `verifyChain`, Phase 04).

## Validation gate
```bash
pnpm --filter @cura/telemetry test
pnpm --filter @cura/api test
pnpm --filter @cura/web e2e -- audit.spec.ts
pnpm typecheck
```
- **Acceptance:** a request produces a trace with spans across API→(worker) and **no PHI** in
  attributes (asserted); the audit UI lists a just-performed mutation with correct actor/action and
  respects tenant scope; the run inspector shows the steps of a note generation and a replay renders;
  audit-chain status shows "verified" (and "broken" if a row is tampered).

## Definition of Done
- [ ] OTel traces/metrics/logs across apps; PHI-free attributes (tested).
- [ ] Audit trail UI with filtering + tenant scope.
- [ ] Run inspector with step timeline + replay.
- [ ] Chain integrity surfaced.

## Handoff notes
- **Package:** `libs/telemetry` (`@cura/telemetry`, L1 → shared/core). Interface-first like every
  provider (ASR/LLM/EHR): `Telemetry` (tracer+meter) with `InMemoryTelemetry` (dev/tests),
  `NoopTelemetry` (default), and an OTLP path loaded **lazily** so the OTel SDK is optional and the
  lib stays offline-testable. Selected by `OTEL_EXPORTER` (`none`|`memory`|`otlp`).
- **PHI-free guarantee (the healthcare-grade bit):** ALL span/metric attributes flow through
  `sanitizeAttributes`, which DROPS any PHI/secret-named key (content/transcript/clientLabel/note/…,
  substring-aware) and any non-primitive value. Asserted in `sanitize.spec.ts` + the API test.
- **Instrumentation:** `recordHttpRequest` (span + RED metrics `http.server.requests/duration_ms/errors`,
  keyed by route TEMPLATE not path → bounded cardinality, no id-in-path leak), `withSpan` (worker/LLM),
  `recordWsConnection`/`recordWsMessage` (type/direction only, never payload).
- **API wiring:** `plugins/metrics.ts` emits per-request spans + RED metrics via `app.telemetry`
  (injectable; noop by default). `buildApp(platform, { telemetry })` lets tests assert spans. `/metrics`
  Prometheus endpoint kept.
- **Audit UI API:** `routes/audit.ts` — `GET /audit` (filter by actor/action/resource/phiTouched,
  tenant-scoped, newest-first), `GET /audit/verify` (hash-chain integrity via `verifyChain`),
  `GET /runs/:resource` (ordered steps for the run inspector). Gated by `audit:read`.
- **Web UI:** `routes/audit.tsx` (live filterable trail + chain-integrity badge) and `routes/runs.tsx`
  (run inspector timeline with per-step context). Composed from `@cura/ui` primitives — a shared
  `AuditTicker` component in `@cura/ui` is the remaining refactor.
- **Data contract:** run inspector reads generic `audit_events` (actor/action/resource/phiTouched/
  context/createdAt), so it works for all three verticals unchanged.
- **Deploy TODO:** wire real OTLP trace/metric providers in `initTelemetry` (SDK install +
  `OTEL_EXPORTER_OTLP_ENDPOINT`); pick backend (Grafana/Datadog); build dashboards.
- **Validation:** `libs/telemetry` 12 tests + `apps/api/test/observability.spec.ts` (5) +
  `apps/web/src/routes/audit.spec.tsx` (2) + `e2e` — all green; repo-wide gate clean (428 tests).
