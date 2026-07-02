import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isAppError } from "@cura/shared";
import { AutoApproveGate, DenyByDefaultGate } from "./approval.js";
import { InMemoryAgentMemory } from "./memory.js";
import { ScriptedPlanner } from "./planner.js";
import { AgentRuntime } from "./runtime.js";
import type { AgentAudit, AgentAuditEvent, AgentContext, AgentTool } from "./types.js";

/** Capturing audit sink for assertions. */
class RecordingAudit implements AgentAudit {
  readonly events: AgentAuditEvent[] = [];
  async record(e: AgentAuditEvent): Promise<void> {
    this.events.push(e);
  }
}

function ctx(over: Partial<AgentContext> = {}): { context: AgentContext; audit: RecordingAudit } {
  const audit = new RecordingAudit();
  const context: AgentContext = {
    orgId: "org-1",
    runId: "run-1",
    memory: new InMemoryAgentMemory("org-1"),
    approvals: new AutoApproveGate("supervisor"),
    audit,
    ...over,
  };
  return { context, audit };
}

/** A read tool (no side effect) that records a fact to memory. */
const lookupTool: AgentTool<{ query: string }> = {
  name: "lookup",
  description: "Look up caller info",
  schema: z.object({ query: z.string().min(1) }),
  sideEffect: false,
  async execute(input, c) {
    await c.memory.set("last_query", input.query);
    return `found:${input.query}`;
  },
};

/** A side-effect tool (books something) — must be approved. */
const bookTool: AgentTool<{ slot: string }> = {
  name: "book",
  description: "Book an appointment",
  schema: z.object({ slot: z.string().min(1) }),
  sideEffect: true,
  async execute(input) {
    return `booked:${input.slot}`;
  },
};

describe("AgentRuntime", () => {
  it("runs a read tool without approval and audits it", async () => {
    const { context, audit } = ctx();
    const planner = new ScriptedPlanner([
      { type: "tool", tool: "lookup", input: { query: "insurance" } },
      { type: "final", message: "All set." },
    ]);
    const res = await new AgentRuntime().run("hello", {
      goal: "help",
      tools: [lookupTool, bookTool],
      planner,
      context,
    });

    expect(res.executed).toEqual([{ tool: "lookup", result: "found:insurance" }]);
    expect(res.finalMessage).toBe("All set.");
    expect(await context.memory.get("last_query")).toBe("insurance");
    expect(audit.events.map((e) => e.action)).toContain("agent.tool.executed");
    expect(audit.events.at(-1)?.action).toBe("agent.completed");
  });

  it("BLOCKS a side-effect tool when the approval gate denies it", async () => {
    const { context, audit } = ctx({ approvals: new DenyByDefaultGate("no approver") });
    const planner = new ScriptedPlanner([
      { type: "tool", tool: "book", input: { slot: "2026-07-10T15:00" } },
      { type: "final", message: "I've requested approval to book." },
    ]);
    const res = await new AgentRuntime().run("book me", {
      goal: "book",
      tools: [bookTool],
      planner,
      context,
    });

    expect(res.executed).toEqual([]); // nothing ran
    expect(res.denied).toEqual([{ tool: "book", reason: "no approver" }]);
    expect(audit.events.some((e) => e.action === "agent.tool.denied")).toBe(true);
    expect(audit.events.some((e) => e.action === "agent.tool.executed")).toBe(false);
  });

  it("EXECUTES a side-effect tool only after approval, and audits approve+execute", async () => {
    const { context, audit } = ctx({ approvals: new AutoApproveGate("front-desk-lead") });
    const planner = new ScriptedPlanner([
      { type: "tool", tool: "book", input: { slot: "2026-07-10T15:00" } },
      { type: "final", message: "Booked!" },
    ]);
    const res = await new AgentRuntime().run("book me", {
      goal: "book",
      tools: [bookTool],
      planner,
      context,
    });

    expect(res.executed).toEqual([{ tool: "book", result: "booked:2026-07-10T15:00" }]);
    const actions = audit.events.map((e) => e.action);
    expect(actions).toContain("agent.tool.approved");
    expect(actions).toContain("agent.tool.executed");
  });

  it("rejects invalid planner tool input at the boundary (no execution)", async () => {
    const { context } = ctx();
    const planner = new ScriptedPlanner([
      { type: "tool", tool: "lookup", input: { query: "" } }, // fails min(1)
      { type: "final", message: "done" },
    ]);
    const res = await new AgentRuntime().run("x", { goal: "g", tools: [lookupTool], planner, context });
    expect(res.executed).toEqual([]);
    expect(res.turns.some((t) => t.role === "tool" && t.text.startsWith("error: invalid input"))).toBe(true);
  });

  it("handles an unknown tool without crashing", async () => {
    const { context } = ctx();
    const planner = new ScriptedPlanner([
      { type: "tool", tool: "ghost", input: {} },
      { type: "final", message: "done" },
    ]);
    const res = await new AgentRuntime().run("x", { goal: "g", tools: [lookupTool], planner, context });
    expect(res.finalMessage).toBe("done");
    expect(res.turns.some((t) => t.text.includes('unknown tool "ghost"'))).toBe(true);
  });

  it("throws a typed error when the step budget is exhausted", async () => {
    const { context } = ctx();
    // A planner that never finishes.
    const planner = new ScriptedPlanner([{ type: "tool", tool: "lookup", input: { query: "loop" } }]);
    // Re-plan the same tool forever by repeating via a custom planner:
    const loopingPlanner = {
      async plan() {
        return { type: "tool", tool: "lookup", input: { query: "loop" } } as const;
      },
    };
    void planner;
    const err = await new AgentRuntime()
      .run("x", { goal: "g", tools: [lookupTool], planner: loopingPlanner, context, maxSteps: 3 })
      .then(() => null, (e) => e);
    expect(isAppError(err)).toBe(true);
    expect((err as { code: string }).code).toBe("validation_error");
  });
});
