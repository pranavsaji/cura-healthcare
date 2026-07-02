# Phase 09 — LLM Gateway (`@cura/llm`)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 04
- **Unblocks:** 11 (note engine), 17/18 (agentic verticals)

## Objective
A model-agnostic LLM gateway: a single interface for text + **structured (schema-forced) output** +
tool-calling, with a **Claude** provider and an offline **mock**, plus a versioned prompt registry,
retries/fallback, token/cost tracking, and guardrails. Note fidelity is the product — this layer is
where we guarantee it.

## Context you need
- Demo exists (`apps/api/src/providers/llm.ts`, deterministic mock + Anthropic stub). Promote to
  `libs/llm` with the real Claude Messages API + structured output.
- Use the latest Claude models via `@cura/core` config (`LLM_MODEL`). Read `/plan.md` §7.
- L3 layer: depends on `shared`, `core`. **Consult the `claude-api` skill/docs before writing the
  Anthropic call** (model ids, tool-use, structured output) — do not code from memory.

## Reusability & scalability mandate
- One `LlmProvider` interface used by note-gen AND future agents (Curadesk/Curabill): `generateText`,
  `generateStructured<T>(schema)` (tool-forced JSON, validated with zod), `runTools` (agent loop).
- **Prompt registry** versions every prompt; each generation records `{ model, promptVersion,
  tokens, cost, latency }` for reproducibility + audit (Phase 14).
- Provider-swappable + mock for deterministic tests. No Anthropic SDK outside this package.

## Deliverables
```
libs/llm/src/
  index.ts
  types.ts               # LlmProvider, GenOptions, Usage, ToolSpec
  mock.ts                # deterministic structured output for tests/offline
  anthropic.ts           # Claude Messages API: text, tool-forced JSON, streaming, tool loop
  gateway.ts             # routing, fallback, retry (via @cura/core), usage/cost tracking
  prompts/               # versioned prompt templates (note-gen, risk-scan, ...)
  registry.ts            # prompt lookup by id+version
  guardrails.ts          # output validation, PHI-minimizing wrappers, refusal handling
  factory.ts             # createLlm(config) → mock|anthropic (+ gateway)
  contract.spec.ts       # mock ≡ anthropic shape (real gated by key)
  *.spec.ts
```

## Implementation tasks
1. **Interface + factory** by `LLM_PROVIDER`; default `mock`. Missing key → mock fallback.
2. **Anthropic provider:** implement `generateStructured` using tool-forced JSON so output matches a
   zod schema; validate + one repair-retry on mismatch. Support streaming for progressive note fill.
   (Verify model ids + tool-use params against the `claude-api` reference.)
3. **Gateway:** retry/backoff (from `@cura/core`), model fallback, and `Usage` accounting
   (tokens/cost/latency) returned with every call and logged (no PHI).
4. **Prompt registry:** store prompts with stable `id@version`; the note-gen prompt (Phase 11) lives
   here. Changing a prompt bumps the version.
5. **Guardrails:** enforce max tokens/time; validate structured output; strip/deny disallowed
   content; ensure prompts carry minimum-necessary PHI.
6. **Contract test:** same suite for mock and (keyed) Claude — assert schema-valid structured output
   and populated `Usage`.

## Validation gate
```bash
pnpm --filter @cura/llm test                    # mock + contract
ANTHROPIC_API_KEY=… LLM_PROVIDER=anthropic pnpm --filter @cura/llm test   # optional, gated
pnpm typecheck
```
- **Acceptance:** `generateStructured(schema)` always returns a value that `schema.parse()` accepts
  (mock and, when keyed, Claude); a forced schema mismatch triggers exactly one repair-retry then a
  typed `ProviderError`; every call returns `Usage`; prompt changes require a version bump (registry
  test).

## Definition of Done
- [ ] `LlmProvider` interface + gateway + mock + Claude; contract green.
- [ ] Structured output validated against zod with repair-retry.
- [ ] Prompt registry versioned; usage/cost tracked and logged (no PHI).
- [ ] Anthropic call verified against the `claude-api` reference (not memory).

## Handoff notes
- **Package:** `@cura/llm` (L3, deps: `shared`, `core`). Public surface via `src/index.ts`.
- **Interface:** `LlmProvider = { generateText, generateStructured<T>(schema), runTools }`, each
  returning `Usage { model, promptVersion?, inputTokens, outputTokens, costUsd, latencyMs }`.
  Factory: `createLlm(config, { onFallback, gateway })` → always returns an `LlmGateway` wrapping the
  concrete provider.
- **Providers:** `mock` (default) and `anthropic`. Anthropic uses the **raw Messages API via global
  `fetch`** (no SDK) — verified against the Anthropic reference (endpoint `POST /v1/messages`,
  headers `x-api-key` + `anthropic-version: 2023-06-01`, tool-use, `usage.input_tokens/output_tokens`,
  streaming SSE, `stop_reason` incl. `refusal`). `AnthropicProvider` accepts an injectable
  `fetchImpl` so the whole thing is unit-testable offline.
- **Structured output mechanism:** forced tool call — a tool `emit_result` whose `input_schema` is
  derived from the caller's zod schema (`zodToJsonSchema`), with `tool_choice: {type:"tool",
  name:"emit_result"}`. Response `tool_use.input` is re-validated with zod; on mismatch there is
  **exactly one repair round-trip** (feeding the errors back as a `tool_result`), then a
  **non-retryable** `ProviderError`.
- **Mock structured output:** `mockValueForSchema` synthesizes a minimal schema-valid value, so
  `generateStructured` always satisfies `schema.parse()` offline (contract guarantee). Tests can
  inject `responders` to script exact outputs.
- **Gateway:** retry with backoff (via `@cura/core withRetry`) on **transient** errors only
  (provider/network/rate-limit); validation/refusal/repair failures are marked non-retryable and are
  NOT retried. Optional **model fallback** (`fallbackModel`) — one shot on the fallback after the
  primary is exhausted. Running usage/cost accounting via `gateway.totals()` + `onUsage` hook (no
  PHI). `withRetry`'s `RetryError` is unwrapped so callers see the real error type.
- **Prompt registry:** `PromptRegistry` versions every prompt by `id@version`; re-registering the
  same version throws (forces a deliberate bump). `defaultPromptRegistry()` ships `note-gen@1`
  (Phase 11 note engine) and `risk-scan@1`. `Usage.promptVersion` records which prompt produced a
  generation.
- **Guardrails:** `MODEL_PRICING` cost table (`estimateCost`), output-token + timeout clamps,
  `validateStructured` (zod), refusal detection, and `minimizePhi` (scrubs SSN/email/phone/MRN as
  defense-in-depth — primary minimization is de-identified labels upstream).
- **Models:** default `claude-opus-4-8`; price table also covers `claude-sonnet-5`,
  `claude-haiku-4-5`. Config knobs (already in `@cura/core`): `LLM_PROVIDER`, `LLM_MODEL`,
  `ANTHROPIC_API_KEY`.
- **Tests:** contract suite runs on mock always; Anthropic gated by `ANTHROPIC_API_KEY`. Anthropic
  request-building, tool-forced parsing, repair-retry, streaming SSE, and the tool loop are covered
  offline via `fetchImpl` injection. Coverage on `libs/llm/src` ≈ 95% lines. BAA not yet signed →
  `mock` only in shared/dev.
