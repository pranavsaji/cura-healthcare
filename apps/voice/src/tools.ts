import { z } from "zod";
import type { AgentTool } from "@cura/agents";
import type { BenefitsVerifier } from "@cura/benefits";
import type { Scheduler } from "@cura/scheduling";
import type { FrontDeskStore } from "./store.js";

/**
 * The front-desk agent's toolbox, each tool wrapping a provider-swappable lib.
 * READ tools (benefits/slots) run freely; the money/commitment tool
 * (`book_appointment`) is marked `sideEffect` so the runtime HITL-gates + audits
 * it. Tools are bound to the call's tenant + client, so no tool can act outside
 * the call's `orgId`.
 */
export interface FrontDeskToolDeps {
  scheduler: Scheduler;
  benefits: BenefitsVerifier;
  store: FrontDeskStore;
  orgId: string;
  callId: string;
  clientLabel: string;
}

export function buildFrontDeskTools(deps: FrontDeskToolDeps): AgentTool[] {
  const { scheduler, benefits, store, orgId, callId, clientLabel } = deps;

  const verifyBenefits: AgentTool<{ payerId: string; memberId: string }> = {
    name: "verify_benefits",
    description: "Verify the caller's insurance eligibility and benefits",
    schema: z.object({ payerId: z.string().min(1), memberId: z.string().min(1) }),
    sideEffect: false,
    async execute(input, ctx) {
      const res = await benefits.verify({ orgId, payerId: input.payerId, memberId: input.memberId, clientLabel });
      if (!res.ok) return `benefits check failed: ${res.error.kind}`;
      await ctx.memory.set("benefits", JSON.stringify({ active: res.value.active, priorAuth: res.value.priorAuthRequired }));
      return res.value.active
        ? `Coverage active on ${res.value.planName}. Copay $${(res.value.copayCents / 100).toFixed(2)}.${res.value.priorAuthRequired ? " Prior auth required." : ""}`
        : "Coverage inactive or member not found.";
    },
  };

  const saveReferral: AgentTool<{ payerId: string; memberId: string; reason: string }> = {
    name: "save_referral",
    description: "Record a qualified referral for this caller",
    schema: z.object({ payerId: z.string().min(1), memberId: z.string().min(1), reason: z.string().min(1) }),
    sideEffect: false,
    async execute(input, ctx) {
      const ref = store.addReferral({ orgId, callId, clientLabel, payerId: input.payerId, memberId: input.memberId, reason: input.reason });
      await ctx.memory.set("referral", ref.id);
      return `referral ${ref.id} qualified`;
    },
  };

  const findSlots: AgentTool<{ date: string }> = {
    name: "find_slots",
    description: "Find open appointment slots on a date (YYYY-MM-DD)",
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    sideEffect: false,
    async execute(input, ctx) {
      const res = await scheduler.findSlots({ orgId, date: input.date });
      if (!res.ok) return `no slots: ${res.error.kind}`;
      if (res.value.length === 0) return "no open slots that day";
      await ctx.memory.set("next_slot", res.value[0]!.id);
      return `open slots: ${res.value.slice(0, 3).map((s) => s.id).join(", ")}`;
    },
  };

  const bookAppointment: AgentTool<{ slotId?: string }> = {
    name: "book_appointment",
    description: "Book an appointment in a specific slot (commits the schedule)",
    schema: z.object({ slotId: z.string().optional() }),
    sideEffect: true, // money/commitment → HITL-gated + audited
    async execute(input, ctx) {
      const slotId = input.slotId ?? (await ctx.memory.get("next_slot"));
      if (!slotId) return "no slot selected — call find_slots first";
      const res = await scheduler.book({ orgId, slotId, clientLabel }, `${callId}:${slotId}`);
      if (!res.ok) return `booking failed: ${res.error.kind}`;
      store.addAppointment({ orgId, callId, slotId, startsAt: res.value.startsAt, clientLabel });
      return `appointment booked for ${res.value.startsAt}`;
    },
  };

  return [verifyBenefits, saveReferral, findSlots, bookAppointment];
}
