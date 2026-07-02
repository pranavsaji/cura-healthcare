import { describe, expect, it } from "vitest";
import { createLlm } from "@cura/llm";
import { LlmPlanner, ScriptedPlanner } from "./planner.js";
import type { PlannerState } from "./types.js";

const state: PlannerState = {
  goal: "qualify and book",
  turns: [{ role: "user", text: "I need an appointment" }],
  tools: [
    { name: "lookup", description: "look up", sideEffect: false },
    { name: "book", description: "book appt", sideEffect: true },
  ],
};

describe("planners", () => {
  it("ScriptedPlanner returns each decision then falls through to final", async () => {
    const p = new ScriptedPlanner([{ type: "tool", tool: "lookup", input: { q: 1 } }], "bye");
    expect(await p.plan()).toEqual({ type: "tool", tool: "lookup", input: { q: 1 } });
    expect(await p.plan()).toEqual({ type: "final", message: "bye" });
  });

  it("LlmPlanner returns a well-formed decision via the (mock) gateway", async () => {
    const llm = createLlm({ provider: "mock" });
    const decision = await new LlmPlanner(llm).plan(state);
    expect(["tool", "final"]).toContain(decision.type);
    if (decision.type === "tool") {
      expect(typeof decision.tool).toBe("string");
    } else {
      expect(typeof decision.message).toBe("string");
    }
  });
});
