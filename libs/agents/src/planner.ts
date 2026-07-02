import { z } from "zod";
import type { LlmProvider } from "@cura/llm";
import type { Planner, PlannerDecision, PlannerState } from "./types.js";

/**
 * A deterministic planner driven by a fixed script of decisions. This is the
 * test/demo planner: it makes agent behaviour reproducible (no LLM, no clock,
 * no randomness — CONVENTIONS §5) so we can assert exact tool sequences, gating,
 * and audit. Once the script is exhausted it falls through to a final message.
 */
export class ScriptedPlanner implements Planner {
  private i = 0;
  constructor(
    private readonly script: PlannerDecision[],
    private readonly fallbackMessage = "Is there anything else I can help with?",
  ) {}

  async plan(): Promise<PlannerDecision> {
    const next = this.script[this.i];
    this.i += 1;
    return next ?? { type: "final", message: this.fallbackMessage };
  }
}

/** Structured decision the LLM must return each step. */
const DecisionSchema = z.object({
  type: z.enum(["tool", "final"]),
  tool: z.string().optional(),
  input: z.record(z.unknown()).optional(),
  message: z.string().optional(),
});

/**
 * The production planner: asks the LLM (via the gateway) for the next step as
 * **structured output**, so the runtime keeps control of tool execution + HITL
 * (the LLM proposes; the runtime disposes). Reuses `@cura/llm` — no vendor SDK
 * here (CONVENTIONS §2).
 */
export class LlmPlanner implements Planner {
  constructor(
    private readonly llm: LlmProvider,
    private readonly options: { maxTokens?: number } = {},
  ) {}

  async plan(state: PlannerState): Promise<PlannerDecision> {
    const prompt = this.render(state);
    const { value } = await this.llm.generateStructured(DecisionSchema, prompt, {
      system:
        "You are a front-desk/operations agent. Choose the single next action. " +
        "Use a tool when you need information or to perform an action; otherwise finish. " +
        "Never invent tools outside the provided list.",
      ...(this.options.maxTokens ? { maxTokens: this.options.maxTokens } : {}),
    });

    if (value.type === "tool" && value.tool) {
      return { type: "tool", tool: value.tool, input: value.input ?? {} };
    }
    return { type: "final", message: value.message ?? "Thanks — I've taken care of that." };
  }

  private render(state: PlannerState): string {
    const tools = state.tools
      .map((t) => `- ${t.name}${t.sideEffect ? " (requires approval)" : ""}: ${t.description}`)
      .join("\n");
    const convo = state.turns
      .map((t) => `${t.role}${t.tool ? `(${t.tool})` : ""}: ${t.text}`)
      .join("\n");
    return `Goal: ${state.goal}\n\nAvailable tools:\n${tools}\n\nConversation so far:\n${convo}\n\nDecide the next action.`;
  }
}
