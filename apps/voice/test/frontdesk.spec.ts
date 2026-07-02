import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "@cura/core";
import { createAuditLog, type AuditLog } from "@cura/audit";
import { AutoApproveGate, DenyByDefaultGate, type ApprovalGate } from "@cura/agents";
import { MockBenefitsVerifier } from "@cura/benefits";
import { MockScheduler } from "@cura/scheduling";
import { MockTelephony, type InboundCall } from "@cura/telephony";
import { MockStt, MockTts } from "@cura/voice";
import { FrontDeskService } from "../src/frontdesk.js";
import { FrontDeskStore } from "../src/store.js";
import { MemoryAuditStore } from "../src/memory-audit.js";

/**
 * Phase 17 acceptance for the Curadesk front-desk vertical:
 *  • inbound call answered by the agent in < 2s (measured),
 *  • agent verifies benefits (mock tool) and books via the (mock) scheduler,
 *    both gated + audited,
 *  • calls/referrals are tenant-scoped,
 *  • booking is BLOCKED without an approval.
 */
function build() {
  const clock = new FixedClock();
  const store = new FrontDeskStore();
  const auditStore = new MemoryAuditStore();
  const audit: AuditLog = createAuditLog({ store: auditStore, clock });
  const service = new FrontDeskService({
    scheduler: new MockScheduler(clock),
    benefits: new MockBenefitsVerifier(),
    store,
    audit,
    stt: new MockStt(),
    tts: new MockTts(),
    clock,
  });
  return { service, store, audit, auditStore };
}

const CALL: InboundCall = { id: "call-1", orgId: "org-1", from: "+15550001", to: "+15550100" };

async function simulate(service: FrontDeskService, call: InboundCall, approvals: ApprovalGate = new AutoApproveGate("lead")) {
  const telephony = new MockTelephony();
  let outcome: Awaited<ReturnType<FrontDeskService["handleInboundCall"]>> | undefined;
  telephony.onInboundCall(async (handle) => {
    outcome = await service.handleInboundCall(handle, {
      from: call.from,
      to: call.to,
      clientLabel: "Caller",
      callerIntent: "I'd like to book an intake and check my benefits.",
      approvals,
    });
  });
  await telephony.simulateInboundCall(call);
  return outcome!;
}

describe("Curadesk · FrontDeskService", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => (ctx = build()));

  it("answers the inbound call in under 2 seconds (SLO)", async () => {
    const outcome = await simulate(ctx.service, CALL);
    expect(outcome.answerLatencyMs).toBeLessThan(2000);
  });

  it("verifies benefits and books an appointment (both gated + audited)", async () => {
    const outcome = await simulate(ctx.service, CALL);

    const toolsRun = outcome.executed.map((e) => e.tool);
    expect(toolsRun).toContain("verify_benefits");
    expect(toolsRun).toContain("book_appointment");
    expect(outcome.appointments.length).toBe(1);
    expect(outcome.call.disposition).toBe("booked");

    // The side-effect (booking) was approved + executed + audited.
    const events = await ctx.audit.replay("org-1");
    const ctxEvents = events.map((e) => e.context as { event?: string; tool?: string });
    expect(ctxEvents.some((c) => c.event === "agent.tool.approved" && c.tool === "book_appointment")).toBe(true);
    expect(ctxEvents.some((c) => c.event === "agent.tool.executed" && c.tool === "book_appointment")).toBe(true);

    // The hash-chained audit trail is intact.
    const chain = await ctx.audit.verifyChain("org-1");
    expect(chain.ok).toBe(true);
  });

  it("BLOCKS booking when there is no approval (HITL gate)", async () => {
    const outcome = await simulate(ctx.service, CALL, new DenyByDefaultGate("no approver"));
    expect(outcome.denied.some((d) => d.tool === "book_appointment")).toBe(true);
    expect(outcome.appointments.length).toBe(0);
    // A referral still gets qualified (a read/write, not a gated side effect).
    expect(outcome.referrals.length).toBe(1);
    expect(outcome.call.disposition).toBe("qualified");

    const events = await ctx.audit.replay("org-1");
    expect(events.some((e) => (e.context as { event?: string }).event === "agent.tool.denied")).toBe(true);
  });

  it("keeps calls + referrals tenant-scoped (no cross-org leakage)", async () => {
    await simulate(ctx.service, CALL); // org-1
    await simulate(ctx.service, { ...CALL, id: "call-2", orgId: "org-2" }); // org-2

    expect(ctx.store.listCalls("org-1").every((c) => c.orgId === "org-1")).toBe(true);
    expect(ctx.store.listCalls("org-1").length).toBe(1);
    expect(ctx.store.listReferrals("org-2").every((r) => r.orgId === "org-2")).toBe(true);
    // org-1 cannot see org-2's appointments and vice-versa.
    expect(ctx.store.listAppointments("org-1").some((a) => a.orgId === "org-2")).toBe(false);
  });
});
