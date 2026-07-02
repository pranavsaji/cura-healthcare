import { ValidationError } from "@cura/shared";
import type {
  AgentContext,
  AgentResult,
  AgentTool,
  AgentTurn,
  Planner,
  PlannerState,
} from "./types.js";

export interface RunOptions {
  /** The agent's objective (system goal), e.g. "qualify the caller and book". */
  goal: string;
  tools: AgentTool[];
  planner: Planner;
  context: AgentContext;
  /** Hard cap on planner→tool round-trips (loop safety). Default 8. */
  maxSteps?: number;
  /** Streamed agent utterances (for the voice pipeline / UI). */
  onAgentTurn?: (text: string) => void;
}

/**
 * The agent loop. Each step: the {@link Planner} chooses a tool or a final
 * answer; the runtime validates the tool input, runs **read** tools directly and
 * **side-effect** tools only through the {@link ApprovalGate}, and audits every
 * decision. The planner never touches tools, memory, or approvals directly — the
 * runtime is the single, uniform enforcement point (so Curadesk and Curabill get
 * identical gating + audit semantics for free).
 */
export class AgentRuntime {
  async run(input: string, opts: RunOptions): Promise<AgentResult> {
    const maxSteps = opts.maxSteps ?? 8;
    const toolMap = new Map(opts.tools.map((t) => [t.name, t]));
    const turns: AgentTurn[] = [{ role: "user", text: input }];
    const executed: AgentResult["executed"] = [];
    const denied: AgentResult["denied"] = [];
    const { context } = opts;

    let steps = 0;
    let finalMessage = "";

    while (steps < maxSteps) {
      steps += 1;
      const state: PlannerState = {
        goal: opts.goal,
        turns: [...turns],
        tools: opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          sideEffect: t.sideEffect,
        })),
      };
      const decision = await opts.planner.plan(state);

      if (decision.type === "final") {
        finalMessage = decision.message;
        turns.push({ role: "agent", text: finalMessage });
        opts.onAgentTurn?.(finalMessage);
        await context.audit.record({
          orgId: context.orgId,
          action: "agent.completed",
          resource: `run:${context.runId}`,
          context: { steps },
        });
        break;
      }

      const tool = toolMap.get(decision.tool);
      if (!tool) {
        // Planner asked for an unknown tool — record + feed back, don't crash.
        turns.push({ role: "tool", tool: decision.tool, text: `error: unknown tool "${decision.tool}"` });
        continue;
      }

      // Validate the (untrusted) planner-provided input at the boundary.
      const parsed = tool.schema.safeParse(decision.input);
      if (!parsed.success) {
        turns.push({
          role: "tool",
          tool: tool.name,
          text: `error: invalid input (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`,
        });
        continue;
      }

      // HITL gate for side effects.
      if (tool.sideEffect) {
        const decisionA = await context.approvals.requestApproval({
          orgId: context.orgId,
          tool: tool.name,
          summary: `${tool.name}: ${tool.description}`,
          input: parsed.data,
        });
        if (!decisionA.approved) {
          denied.push({ tool: tool.name, reason: decisionA.reason });
          turns.push({ role: "tool", tool: tool.name, text: `blocked: awaiting approval (${decisionA.reason})` });
          await context.audit.record({
            orgId: context.orgId,
            action: "agent.tool.denied",
            resource: `run:${context.runId}`,
            context: { tool: tool.name, reason: decisionA.reason },
          });
          continue;
        }
        await context.audit.record({
          orgId: context.orgId,
          action: "agent.tool.approved",
          resource: `run:${context.runId}`,
          context: { tool: tool.name, approver: decisionA.approver },
        });
      }

      const result = await tool.execute(parsed.data, context);
      executed.push({ tool: tool.name, result });
      turns.push({ role: "tool", tool: tool.name, text: result });
      await context.audit.record({
        orgId: context.orgId,
        action: "agent.tool.executed",
        resource: `run:${context.runId}`,
        context: { tool: tool.name, sideEffect: tool.sideEffect },
      });
    }

    if (!finalMessage && steps >= maxSteps) {
      // Loop budget exhausted without a final answer — a handled outcome.
      throw new ValidationError("Agent exceeded its step budget", {
        details: { maxSteps, runId: context.runId },
      });
    }

    return { finalMessage, turns, executed, denied, steps };
  }
}
