# Phase 17 — Curadesk (Front-Desk Voice Vertical)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 16
- **Unblocks:** —

## Objective
The second vertical: AI front-desk voice agents that answer inbound calls in **< 2 seconds**, qualify
referrals, schedule appointments, and verify benefits — reusing the platform (auth, tenancy, memory,
audit, realtime, LLM agent loop) and adding telephony + a low-latency voice pipeline.

## Context you need
- This is an **expansion** vertical; it must reuse Phases 04–14, not fork them. New surface =
  telephony + voice + scheduling/benefits tools.
- Tech: **LiveKit / Twilio** for telephony + realtime voice; the agent loop from `@cura/llm`
  (Phase 09). Read `/plan.md` §1.2 (Curadesk), §2.3.

## Reusability & scalability mandate
- **New `apps/voice` app** + `libs/telephony` + `libs/agents` (tool-calling loop), but identity,
  tenancy, memory, audit, and realtime come from existing libs unchanged.
- Scheduling/benefits are **tools** behind interfaces (like EHR connectors), each with a mock +
  contract test.
- < 2s answer is an SLO with a test.

## Deliverables
```
libs/telephony/src/        # Twilio/LiveKit behind an interface (+ mock); inbound call events
libs/voice/src/            # streaming STT↔LLM↔TTS pipeline (barge-in, endpointing)
libs/agents/src/           # tool-calling agent runtime (shared w/ Curabill): tools, memory, planner
libs/scheduling/src/       # calendar/scheduler tools (interface + adapters + mock)
libs/benefits/src/         # eligibility/benefits verification tools (interface + mock)
apps/voice/src/            # telephony bridge + agent orchestration + call recording/transcript
apps/web/src/routes/frontdesk.tsx   # call log, referrals, dispositions
**/contract.spec.ts  **/*.spec.ts
```

## Implementation tasks
1. **Telephony interface + adapter** (Twilio/LiveKit) + mock; inbound call → session → audio stream
   over the existing realtime hub.
2. **Voice pipeline:** streaming STT (reuse `@cura/transcription`) ↔ LLM agent (`@cura/llm`) ↔ TTS,
   with endpointing + **barge-in**; target first response < 2s.
3. **Agent runtime (`libs/agents`):** tool-calling loop with per-tenant memory + human-in-the-loop
   gates on side effects; shared with Curabill (Phase 18).
4. **Tools:** referral qualification, scheduling (calendar adapter), benefits verification — each an
   interface + mock + contract test; side-effectful tools are gated + audited.
5. **Persistence:** `calls`, `referrals`, `appointments` tables; call recording + transcript reuse
   scribe storage/transcript services.
6. **Front-desk UI:** call log, dispositions, referral pipeline.

## Validation gate
```bash
pnpm --filter @cura/voice test
pnpm --filter @cura/agents test
pnpm --filter @cura/telephony test
pnpm test:load -- frontdesk        # answer-latency SLO
pnpm typecheck && pnpm verify
```
- **Acceptance:** a simulated inbound call is answered by the agent in < 2s (measured); the agent
  books an appointment via the (mock) scheduler and verifies benefits via the (mock) tool, both
  gated + audited; calls/referrals are tenant-scoped; barge-in interrupts TTS correctly.

## Definition of Done
- [ ] Telephony + voice pipeline behind interfaces (+ mocks); < 2s answer SLO tested.
- [ ] Shared agent runtime with memory + HITL gates.
- [ ] Scheduling + benefits tools with contract tests.
- [ ] Reuses platform libs unchanged; new data tenant-scoped + audited.

## Handoff notes
**Delivered (validated 2026-07):**
- **`@cura/agents`** (`libs/agents`) — the SHARED tool-calling runtime (reused by Curabill/18).
  `AgentRuntime` owns the loop; a `Planner` decides steps (`ScriptedPlanner` deterministic /
  `LlmPlanner` via `@cura/llm` structured output). Per-tenant `AgentMemory` (`TenantMemoryRegistry`),
  HITL `ApprovalGate` (`DenyByDefault`/`AutoApprove`/`QueuedApprovalGate`), `AgentAudit`. **Every
  side-effect tool is gated + audited by the runtime** — planners never touch tools/approvals directly.
- **`@cura/telephony`** — `TelephonyProvider`/`CallHandle` interface, `MockTelephony` (drives
  `simulateInboundCall`), and a real `TwilioTelephony` bound to an injected `MediaTransport`
  (contract-tested with a fake transport — no live socket in CI).
- **`@cura/voice`** — `VoicePipeline`: endpointing (end-of-utterance frames), **barge-in** (a caller
  frame during agent speech cancels the reply — asserted), first-response latency metric. Greeting is
  spoken on answer so the **< 2s SLO** clock is minimized. `MockStt`/`MockTts`.
- **`@cura/scheduling`** + **`@cura/benefits`** — interface + mock + contract; booking is idempotent,
  benefits verification typed-Result.
- **`@cura/voice-app`** (`apps/voice`) — `FrontDeskService` orchestrator: answer→greet→agent(tools)→
  persist (calls/referrals/appointments, **tenant-scoped**)→audit. Toolbox: `verify_benefits`,
  `save_referral`, `find_slots` (reads) + `book_appointment` (**side-effect, HITL-gated**).
- **Web:** `apps/web/src/routes/frontdesk.tsx` (call log, referral pipeline, dispositions, SLA badges) +
  nav link (`calls:manage`).

**Choices:** telephony provider = Twilio/LiveKit behind `MediaTransport` (mock in CI). Latency: greeting
on answer → measured `answerLatencyMs`. Agent memory = per-org KV (`InMemoryAgentMemory`; Redis/PG in
prod). Barge-in = cooperative cancel checked between outbound frames. Audit: agent events land on the
hash-chained log under the stable `call.handled` action with the specific event in `context.event`.

**Package naming:** the pipeline **lib** is `@cura/voice`; the **app** is `@cura/voice-app` (so the two
don't collide). The gate's `pnpm --filter @cura/voice test` runs the pipeline lib (barge-in + SLO).

**Measured (mock, in-process):** answer p95 well under the 2000 ms SLO across 40 concurrent calls
(`test/load/frontdesk.spec.ts`, run via `pnpm test:load -- frontdesk`).

**Validation:** `pnpm --filter @cura/voice test` ✓ (3) · `@cura/agents test` ✓ (14) ·
`@cura/telephony test` ✓ (6) · `@cura/voice-app test` ✓ (4 acceptance: SLO, gated+audited booking,
HITL block, tenant-scope) · `pnpm test:load -- frontdesk` ✓ · `pnpm typecheck && pnpm verify` ✓
(573 unit tests). New root devDeps link the libs so `test/**` can import them.
