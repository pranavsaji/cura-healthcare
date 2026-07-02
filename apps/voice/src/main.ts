import { createLogger, systemClock } from "@cura/core";
import { createAuditLog } from "@cura/audit";
import { AutoApproveGate } from "@cura/agents";
import { MockBenefitsVerifier } from "@cura/benefits";
import { MockScheduler } from "@cura/scheduling";
import { MockTelephony } from "@cura/telephony";
import { MockStt, MockTts } from "@cura/voice";
import { FrontDeskService } from "./frontdesk.js";
import { FrontDeskStore } from "./store.js";
import { MemoryAuditStore } from "./memory-audit.js";

/**
 * Dev bootstrap for the Curadesk voice app. Wires the MOCK providers (no BAAs
 * required) and simulates one inbound call end-to-end, printing the outcome.
 * A real deployment swaps in Twilio/LiveKit telephony, a real STT/TTS, and a
 * queued approval gate backed by the front-desk UI (CONVENTIONS §2/§6).
 */
async function main(): Promise<void> {
  const logger = createLogger({ name: "voice" });
  const clock = systemClock;

  // In prod: a durable AuditStore (Postgres). Here: an in-memory store.
  const audit = createAuditLog({ store: new MemoryAuditStore(), clock });

  const service = new FrontDeskService({
    scheduler: new MockScheduler(clock),
    benefits: new MockBenefitsVerifier(),
    store: new FrontDeskStore(),
    audit,
    stt: new MockStt(),
    tts: new MockTts(),
    clock,
  });

  const telephony = new MockTelephony();
  telephony.onInboundCall(async (handle) => {
    const outcome = await service.handleInboundCall(handle, {
      from: handle.call.from,
      to: handle.call.to,
      clientLabel: "Caller",
      callerIntent: "I'd like to book an intake and check my insurance.",
      approvals: new AutoApproveGate("front-desk-lead"),
    });
    logger.info(
      { answerLatencyMs: outcome.answerLatencyMs, disposition: outcome.call.disposition, booked: outcome.appointments.length },
      "call.handled",
    );
  });

  await telephony.simulateInboundCall({ id: "call-demo", orgId: "org_dev", from: "+15550001", to: "+15550100" });
}

main().catch((err) => {
  console.error("voice app failed:", err);
  process.exitCode = 1;
});
