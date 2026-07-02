import { describe, expect, it } from "vitest";
import { AutoApproveGate, DenyByDefaultGate, QueuedApprovalGate } from "./approval.js";

describe("approval gates (HITL)", () => {
  it("DenyByDefault blocks every side effect", async () => {
    const d = await new DenyByDefaultGate("locked").requestApproval({
      orgId: "o",
      tool: "book",
      summary: "book",
      input: {},
    });
    expect(d.approved).toBe(false);
  });

  it("AutoApprove records the approver", async () => {
    const d = await new AutoApproveGate("lead").requestApproval({
      orgId: "o",
      tool: "book",
      summary: "book",
      input: {},
    });
    expect(d).toEqual({ approved: true, approver: "lead" });
  });

  it("QueuedApprovalGate parks requests until a human resolves them", async () => {
    const gate = new QueuedApprovalGate();
    const p1 = gate.requestApproval({ orgId: "o", tool: "book", summary: "book slot", input: { slot: "x" } });
    expect(gate.size).toBe(1);
    expect(gate.list()[0]?.tool).toBe("book");

    gate.approveNext("supervisor");
    await expect(p1).resolves.toEqual({ approved: true, approver: "supervisor" });
    expect(gate.size).toBe(0);
  });

  it("QueuedApprovalGate can reject", async () => {
    const gate = new QueuedApprovalGate();
    const p = gate.requestApproval({ orgId: "o", tool: "refund", summary: "refund", input: {} });
    gate.rejectNext("policy");
    await expect(p).resolves.toEqual({ approved: false, reason: "policy" });
  });
});
