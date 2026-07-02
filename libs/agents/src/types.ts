import type { z } from "zod";

/**
 * The shared tool-calling agent runtime — used by BOTH Curadesk (Phase 17) and
 * Curabill (Phase 18). It is deliberately transport-agnostic and provider-
 * agnostic: the runtime owns the loop, memory, human-in-the-loop (HITL) gating,
 * and audit, while a {@link Planner} decides the next step (LLM-backed in prod,
 * scripted in tests). Side-effectful tools NEVER run without going through the
 * {@link ApprovalGate}, and every step is audited (CONVENTIONS §2/§6).
 */

/** A capability the agent can invoke. `sideEffect` tools are HITL-gated. */
export interface AgentTool<I = unknown> {
  readonly name: string;
  readonly description: string;
  /** Validates the tool input at the boundary (untrusted planner output). */
  readonly schema: z.ZodType<I>;
  /** True for money/PHI/outbound actions → must be approved before running. */
  readonly sideEffect: boolean;
  /** Execute the tool; return a short string result fed back to the planner. */
  execute(input: I, ctx: AgentContext): Promise<string>;
}

/** Per-tenant scratch memory the agent reads/writes across turns. */
export interface AgentMemory {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  all(): Promise<Record<string, string>>;
}

export type ApprovalDecision =
  | { approved: true; approver: string }
  | { approved: false; reason: string };

/** Human-in-the-loop gate for side-effectful tool calls. */
export interface ApprovalGate {
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
}

export interface ApprovalRequest {
  orgId: string;
  tool: string;
  /** Non-PHI summary of what the tool would do (for the approver UI/log). */
  summary: string;
  input: unknown;
}

/** Audit sink for agent activity — records metadata only, never PHI content. */
export interface AgentAudit {
  record(event: AgentAuditEvent): Promise<void>;
}

export interface AgentAuditEvent {
  orgId: string;
  action: string;
  resource: string;
  /** Non-content context (tool name, decision, step index). */
  context?: Record<string, unknown>;
}

/** Everything a tool execution can reach. Always tenant-scoped by `orgId`. */
export interface AgentContext {
  orgId: string;
  /** Correlation id (call id, workflow id, request id). */
  runId: string;
  memory: AgentMemory;
  approvals: ApprovalGate;
  audit: AgentAudit;
}

/** One entry in the running conversation/transcript the planner reasons over. */
export interface AgentTurn {
  role: "user" | "agent" | "tool";
  /** For a tool turn, the tool name; else undefined. */
  tool?: string;
  text: string;
}

export type PlannerDecision =
  | { type: "tool"; tool: string; input: unknown }
  | { type: "final"; message: string };

export interface PlannerState {
  goal: string;
  turns: AgentTurn[];
  tools: { name: string; description: string; sideEffect: boolean }[];
}

/** Decides the agent's next move. LLM-backed in prod; scripted in tests. */
export interface Planner {
  plan(state: PlannerState): Promise<PlannerDecision>;
}

export interface AgentResult {
  finalMessage: string;
  turns: AgentTurn[];
  /** Tool calls that actually executed (approved), in order. */
  executed: { tool: string; result: string }[];
  /** Side-effect tool calls that were blocked by the approval gate. */
  denied: { tool: string; reason: string }[];
  steps: number;
}
