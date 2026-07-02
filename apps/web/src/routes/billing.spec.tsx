// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BillingRoute, type BillingClaim } from "./billing.js";

const CLAIMS: BillingClaim[] = [
  { id: "CLM-1", payer: "Aetna", amountCents: 27000, status: "paid" },
  { id: "CLM-2", payer: "BCBS", amountCents: 15000, status: "awaiting_approval" },
  { id: "CLM-3", payer: "Cigna", amountCents: 18000, status: "denied", carc: "197", reason: "Prior auth absent" },
];

describe("BillingRoute", () => {
  it("lists claims, denials, and pending approvals", () => {
    render(<BillingRoute claims={CLAIMS} />);
    expect(screen.getByLabelText("Claims")).toBeTruthy();
    expect(screen.getByText("CLM-3")).toBeTruthy();
    expect(screen.getByLabelText("Denials").textContent).toContain("CARC 197");
    expect(screen.getByLabelText("Billing summary").textContent).toContain("1 denials");
    expect(screen.getByLabelText("Billing summary").textContent).toContain("1 awaiting approval");
  });

  it("requires an explicit approval to submit a money-moving claim (HITL)", async () => {
    const user = userEvent.setup();
    render(<BillingRoute claims={CLAIMS} />);
    // The awaiting-approval claim shows an approve button.
    const approve = screen.getByRole("button", { name: /Approve & submit/i });
    expect(approve).toBeTruthy();
    await user.click(approve);
    // After approval the approvals panel is gone (claim moved to submitted).
    expect(screen.queryByLabelText("Approvals")).toBeNull();
    expect(screen.getByLabelText("Billing summary").textContent).toContain("0 awaiting approval");
  });
});
