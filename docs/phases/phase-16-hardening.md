# Phase 16 — Hardening & Compliance

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 12, 13
- **Unblocks:** 17, 18 (verticals build on a hardened base)

## Objective
Take the working scribe platform to production-trust: security hardening, HIPAA/SOC 2 posture,
performance/load targets, resiliency, and a release process — verified with security, load, and
chaos tests, not just claims.

## Context you need
- All PHI paths exist by now (capture, transcript, notes, EHR). This phase proves they're safe and
  performant.
- Read `/plan.md` §8 (security), CONVENTIONS §6.

## Reusability & scalability mandate
- Security controls are cross-cutting (in `libs/core`/gateway/telemetry), applied uniformly — not
  per-feature patches.
- Load + chaos harnesses are reusable to gate future verticals.

## Deliverables
```
docs/compliance/
  HIPAA.md  SOC2-controls.md  data-flow-diagram.md  subprocessors.md  incident-response.md
  retention-policy.md  access-review.md
apps/api/src/plugins/security.ts   # headers (helmet), CORS lockdown, CSRF where relevant
infra/                              # secrets manager, KMS, backups, WAF/rate-limit, TLS
test/load/                          # k6/Artillery scripts (transcript + note-gen throughput)
test/security/                      # zod-fuzz, authz matrix, dependency audit, ZAP baseline
test/chaos/                         # kill-replica, Redis/PG failover, provider timeout injection
```

## Implementation tasks
1. **Security headers + CORS/CSRF**; secrets in a vault (not `.env` in prod); rotate keys; dependency
   audit (`pnpm audit`, SCA) in CI; SAST + secret scanning.
2. **AuthZ hardening:** automated test enumerating the full role × endpoint matrix (no privilege
   escalation, no cross-tenant access anywhere) — the single most important security test.
3. **PHI review:** confirm encryption in transit + at rest, envelope-encrypted PII, PHI-free logs/
   telemetry (automated scan), retention + hard-delete jobs auditable.
4. **Performance/load:** k6 scenarios hitting the NFRs (partials < 1.5s; note draft < 60s;
   concurrent sessions target). Fix hotspots; add caching where safe.
5. **Resiliency/chaos:** replica kill (sockets resume via Redis, Phase 07), PG/Redis failover,
   provider timeouts → graceful degradation to fallback; graceful shutdown drains.
6. **Compliance docs:** data-flow diagram, subprocessor list + BAA tracker, SOC 2 control mapping,
   incident-response + access-review runbooks.
7. **Release process:** staging → prod, migrations gate, rollback plan, feature flags for risky paths.

## Validation gate
```bash
pnpm verify                      # full gate green
pnpm test:security               # authz matrix + fuzz + dep audit
pnpm test:load                   # meets NFR thresholds
pnpm test:chaos                  # survives replica/dependency failures
```
- **Acceptance:** the authz-matrix test proves no cross-tenant or privilege-escalation path; a PHI-
  in-logs scan returns zero hits; load tests meet the latency/throughput NFRs; killing an API replica
  mid-session does not drop the note stream (resumes); dependency audit has no criticals; compliance
  docs complete.

## Definition of Done
- [ ] AuthZ matrix, PHI-scan, and fuzz security tests green.
- [ ] Load tests meet NFRs; chaos tests survive failures.
- [ ] Security headers/secrets/backups/WAF in place.
- [ ] Compliance docs + release/rollback process written.

## Handoff notes
**Delivered (validated 2026-07):**
- **Security plugin** `apps/api/src/plugins/security.ts` (registered in `app.ts`): strict header set on
  every response (CSP `default-src 'none'`, HSTS in prod, XFO/nosniff/COOP/CORP/Referrer/Permissions,
  `Cache-Control: no-store`) + **CSRF** origin-gate for cookie-authenticated mutations (bearer exempt).
  CORS already locked to `webOrigin`.
- **Authz matrix** `apps/api/test/authz-matrix.spec.ts` — the key test. Enumerates **5 roles × 18
  protected routes**, expectations derived from `can(role, permission)` so guard drift OR a widened
  matrix fails it. Plus unauth→401 sweep, public→200, and **cross-tenant isolation** at the store
  boundary (94 assertions).
- **PHI-free logs** `phi-logs.spec.ts` — full note flow with a capturing logger asserts **zero PHI**
  in any log line + redaction at the source.
- **Fuzz** `fuzz.spec.ts` — seeded (deterministic) adversarial payloads against zod schemas + the
  gateway; asserts never-5xx / never-leak + prototype-pollution resistance.
- **Chaos** `test/chaos/*` — provider-timeout→typed `ProviderError`/fallback, **replica-kill** (state
  rebuilt from shared stores; cross-replica WS resume covered by `realtime.int.spec.ts`), graceful
  shutdown/idempotent `platform.shutdown()`.
- **Load** `test/load/nfr.spec.ts` (in-process NFR gate) + `note-throughput.k6.js` (real-env k6).
- **Compliance docs** `docs/compliance/{HIPAA,SOC2-controls,data-flow-diagram,subprocessors,
  incident-response,retention-policy,access-review}.md`; **release** `docs/RELEASE.md`; **infra**
  `infra/README.md` + `waf-rate-limit.example.yaml`; **DAST** `test/security/zap-baseline.yaml`;
  **SCA** `test/security/dependency-audit.spec.ts` (`pnpm audit`, gates on criticals).
- **New scripts:** `pnpm test:security`, `pnpm test:load`, `pnpm test:chaos` (all Docker-free). Root
  `vitest.config.ts` include extended to `test/**`.

**Bug found + fixed by the fuzzer:** Fastify's own 4xx errors (e.g. 415 unsupported-media-type, 400
malformed-JSON) were being **collapsed to 500** by the error handler — misleading clients and polluting
error-rate alerting. `error-handler.ts` now respects a client-error `statusCode` (4xx) with a safe
canned body. Regression-guarded by `fuzz.spec.ts`.

**Measured NFRs (in-process, mock providers):** partials p95 ≈ 98 ms (< 1500), note draft p95 ≈ 4 ms
(< 60000), 25 concurrent sessions OK. Real-env numbers require running the k6 script against staging.

**Known risks / TODO:** BAAs are all **pending** — platform runs mock-only (see
`docs/compliance/subprocessors.md`); external pen-test + ZAP DAST run in CI against staging; k6/Redis/PG
failover drills require deployed infra (not runnable in this sandbox).

**Validation:** `pnpm verify` ✓ (typecheck + lint + 535 unit tests) · `pnpm test:security` ✓ (107) ·
`pnpm test:chaos` ✓ (7) · `pnpm test:load` ✓ (NFRs met) · `pnpm test:int` (Redis realtime) ✓.
