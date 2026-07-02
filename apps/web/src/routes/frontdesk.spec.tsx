// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FrontdeskRoute, type FrontdeskCall } from "./frontdesk.js";

const CALLS: FrontdeskCall[] = [
  {
    id: "c1",
    from: "+1 (555) 111",
    receivedAt: "2026-07-02T14:00:00Z",
    clientLabel: "New referral",
    disposition: "booked",
    answerLatencyMs: 600,
    referral: { payer: "BCBS", reason: "IOP" },
    appointmentAt: "2026-07-10T09:00:00Z",
  },
  {
    id: "c2",
    from: "+1 (555) 222",
    receivedAt: "2026-07-02T13:00:00Z",
    clientLabel: "Benefits check",
    disposition: "in_progress",
    answerLatencyMs: 2400, // SLA breach
  },
];

describe("FrontdeskRoute", () => {
  it("renders the call log with dispositions, referrals, and SLA summary", () => {
    render(<FrontdeskRoute calls={CALLS} />);
    expect(screen.getByLabelText("Call log")).toBeTruthy();
    expect(screen.getByText("+1 (555) 111")).toBeTruthy();
    expect(screen.getByText("booked")).toBeTruthy();
    // Summary reflects referrals + booked + SLA breach counts.
    const summary = screen.getByLabelText("Front-desk summary");
    expect(summary.textContent).toContain("1 referrals");
    expect(summary.textContent).toContain("1 booked");
    expect(summary.textContent).toContain("1 SLA breaches");
  });

  it("filters the call log by disposition", async () => {
    const user = userEvent.setup();
    render(<FrontdeskRoute calls={CALLS} />);
    await user.selectOptions(screen.getByLabelText("Filter by disposition"), "booked");
    expect(screen.getByText("+1 (555) 111")).toBeTruthy();
    expect(screen.queryByText("+1 (555) 222")).toBeNull();
  });
});
