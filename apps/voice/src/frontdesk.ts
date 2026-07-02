import { systemClock, type Clock } from "@cura/core";
import type { AuditLog } from "@cura/audit";
import {
  AgentRuntime,
  ScriptedPlanner,
  TenantMemoryRegistry,
  type AgentContext,
  type ApprovalGate,
  type Planner,
} from "@cura/agents";
import type { BenefitsVerifier } from "@cura/benefits";
import type { Scheduler } from "@cura/scheduling";
import type { CallHandle } from "@cura/telephony";
import { VoicePipeline, type SpeechToText, type TextToSpeech } from "@cura/voice";
import { AuditLogSink } from "./audit-sink.js";
import { FrontDeskStore, type AppointmentRecord, type CallRecord, type Referral } from "./store.js";
import { buildFrontDeskTools } from "./tools.js";

export interface FrontDeskDeps {
  scheduler: Scheduler;
  benefits: BenefitsVerifier;
  store: FrontDeskStore;
  audit: AuditLog;
  stt: SpeechToText;
  tts: TextToSpeech;
  clock?: Clock;
  memory?: TenantMemoryRegistry;
  greeting?: string;
}

export interface HandleCallOptions {
  from: string;
  to: string;
  clientLabel: string;
  /** The caller's stated need (streamed via ASR in prod; provided here). */
  callerIntent: string;
  /** HITL gate for side-effect tools (booking). */
  approvals: ApprovalGate;
  /** Planner override; defaults to the deterministic scripted front-desk flow. */
  planner?: Planner;
}

export interface CallOutcome {
  call: CallRecord;
  /** ms from answer to first agent audio — the < 2s SLO. */
  answerLatencyMs: number;
  finalMessage: string;
  executed: { tool: string; result: string }[];
  denied: { tool: string; reason: string }[];
  appointments: AppointmentRecord[];
  referrals: Referral[];
}

/**
 * The Curadesk front-desk orchestrator. Answers an inbound call (greeting = first
 * audio, minimizing the SLO clock), runs the shared agent runtime with the
 * front-desk toolbox, persists calls/referrals/appointments tenant-scoped, and
 * audits every step. Side effects (booking) only happen through the approval
 * gate. Reuses the platform (agents, audit, voice, telephony) unchanged.
 */
export class FrontDeskService {
  private readonly clock: Clock;
  private readonly memory: TenantMemoryRegistry;
  private readonly runtime = new AgentRuntime();
  private readonly greeting: string;

  constructor(private readonly deps: FrontDeskDeps) {
    this.clock = deps.clock ?? systemClock;
    this.memory = deps.memory ?? new TenantMemoryRegistry();
    this.greeting = deps.greeting ?? "Thanks for calling — I can help schedule a visit or verify benefits. How can I help?";
  }

  async handleInboundCall(handle: CallHandle, opts: HandleCallOptions): Promise<CallOutcome> {
    const orgId = handle.call.orgId;
    const call = this.deps.store.createCall({
      id: handle.call.id,
      orgId,
      from: opts.from,
      to: opts.to,
      receivedAt: this.clock.nowIso(),
    });
    await this.audit(orgId, "call.received", `call:${call.id}`, { from: opts.from });

    // Answer + greet: the greeting is the first agent audio (SLO metric).
    const pipeline = new VoicePipeline({
      stt: this.deps.stt,
      tts: this.deps.tts,
      greeting: this.greeting,
      respond: async () => "",
      clock: this.clock,
    });
    const session = pipeline.attach(handle);
    await session.start();
    const answerLatencyMs = session.metrics.firstResponseMs ?? 0;

    // Run the shared agent runtime with the front-desk toolbox.
    const context: AgentContext = {
      orgId,
      runId: call.id,
      memory: this.memory.forOrg(orgId),
      approvals: opts.approvals,
      audit: new AuditLogSink(this.deps.audit, "frontdesk-agent"),
    };
    const tools = buildFrontDeskTools({
      scheduler: this.deps.scheduler,
      benefits: this.deps.benefits,
      store: this.deps.store,
      orgId,
      callId: call.id,
      clientLabel: opts.clientLabel,
    });
    const planner = opts.planner ?? defaultFrontDeskFlow();

    const result = await this.runtime.run(opts.callerIntent, {
      goal: "Qualify the caller, verify benefits, and book an appointment when appropriate.",
      tools,
      planner,
      context,
      // Speak each agent utterance back to the caller.
      onAgentTurn: (text) => {
        for (const frame of this.deps.tts.synthesize(text)) handle.sendFrame(frame);
      },
    });

    const appointments = this.deps.store.listAppointments(orgId).filter((a) => a.callId === call.id);
    const referrals = this.deps.store.listReferrals(orgId).filter((r) => r.callId === call.id);
    const disposition: CallRecord["disposition"] =
      appointments.length > 0 ? "booked" : referrals.length > 0 ? "qualified" : "in_progress";
    this.deps.store.setDisposition(call.id, disposition);
    await this.audit(orgId, "call.completed", `call:${call.id}`, { disposition, steps: result.steps });

    return {
      call: { ...call, disposition },
      answerLatencyMs,
      finalMessage: result.finalMessage,
      executed: result.executed,
      denied: result.denied,
      appointments,
      referrals,
    };
  }

  private async audit(orgId: string, event: string, resource: string, context: Record<string, unknown>): Promise<void> {
    await this.deps.audit.record({
      orgId,
      actor: "frontdesk-agent",
      action: "call.handled",
      resource,
      phiTouched: false,
      context: { event, ...context },
    });
  }
}

/**
 * The deterministic demo/test flow: qualify → verify benefits → find slots →
 * book (gated). A production deployment swaps in `LlmPlanner` (from `@cura/agents`)
 * so the agent extracts these details from the live conversation.
 */
export function defaultFrontDeskFlow(): Planner {
  return new ScriptedPlanner(
    [
      { type: "tool", tool: "save_referral", input: { payerId: "12345", memberId: "M2468", reason: "intake" } },
      { type: "tool", tool: "verify_benefits", input: { payerId: "12345", memberId: "M2468" } },
      { type: "tool", tool: "find_slots", input: { date: "2026-07-10" } },
      { type: "tool", tool: "book_appointment", input: {} },
      { type: "final", message: "You're all set — I've verified your benefits and booked your intake." },
    ],
    "Is there anything else I can help you with?",
  );
}
