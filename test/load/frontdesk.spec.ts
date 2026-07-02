import { describe, expect, it } from "vitest";
import { FixedClock, systemClock } from "@cura/core";
import { createAuditLog } from "@cura/audit";
import { AutoApproveGate } from "@cura/agents";
import { MockBenefitsVerifier } from "@cura/benefits";
import { MockScheduler } from "@cura/scheduling";
import { MockTelephony, type InboundCall } from "@cura/telephony";
import { MockStt, MockTts } from "@cura/voice";
import { FrontDeskService } from "../../apps/voice/src/frontdesk.js";
import { FrontDeskStore } from "../../apps/voice/src/store.js";
import { MemoryAuditStore } from "../../apps/voice/src/memory-audit.js";

/**
 * Phase 17 load — the front-desk **answer-latency SLO** under concurrency.
 * `pnpm test:load -- frontdesk`. Simulates N concurrent inbound calls and asserts
 * every call is answered by the agent in < 2s (the Curadesk SLO). Uses mock
 * providers so it measures OUR pipeline overhead, not a carrier's.
 */
const ANSWER_SLO_MS = 2000;
const CONCURRENCY = 40;

function service() {
  // Real clock so answer latency is genuinely measured (not frozen).
  const store = new FrontDeskStore();
  const audit = createAuditLog({ store: new MemoryAuditStore(), clock: systemClock });
  return new FrontDeskService({
    scheduler: new MockScheduler(new FixedClock()),
    benefits: new MockBenefitsVerifier(),
    store,
    audit,
    stt: new MockStt(),
    tts: new MockTts(),
    clock: systemClock,
  });
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function answerOneCall(svc: FrontDeskService, call: InboundCall): Promise<number> {
  const telephony = new MockTelephony();
  let latency = Number.NaN;
  telephony.onInboundCall(async (handle) => {
    const outcome = await svc.handleInboundCall(handle, {
      from: call.from,
      to: call.to,
      clientLabel: "Caller",
      callerIntent: "book an intake and verify benefits",
      approvals: new AutoApproveGate("lead"),
    });
    latency = outcome.answerLatencyMs;
  });
  await telephony.simulateInboundCall(call);
  return latency;
}

describe("load · Curadesk answer-latency SLO", () => {
  it(`answers ${CONCURRENCY} concurrent inbound calls within ${ANSWER_SLO_MS}ms`, async () => {
    const svc = service();
    const latencies = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        answerOneCall(svc, { id: `call-${i}`, orgId: `org-${i % 4}`, from: "+15550001", to: "+15550100" }),
      ),
    );

    expect(latencies.every((l) => Number.isFinite(l))).toBe(true);
    const p95 = percentile(latencies, 95);
    const max = Math.max(...latencies);
    console.log(`[frontdesk SLO] answer p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms (< ${ANSWER_SLO_MS})`);
    expect(p95).toBeLessThan(ANSWER_SLO_MS);
    expect(max).toBeLessThan(ANSWER_SLO_MS);
  });
});
