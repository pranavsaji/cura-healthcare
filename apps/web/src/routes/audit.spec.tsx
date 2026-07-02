// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AuditEvent } from "@cura/shared";
import { makeQueryClient } from "../state/queries.js";
import { AuditRoute } from "./audit.js";

const events: AuditEvent[] = [
  {
    id: "a1",
    orgId: "o1",
    actor: "u1",
    action: "note.signed",
    resource: "note:n1",
    phiTouched: true,
    context: {},
    prevHash: null,
    hash: "h1",
    createdAt: new Date("2026-06-01T10:00:00Z").toISOString(),
  },
];

vi.mock("../api.js", () => ({
  api: {
    audit: vi.fn(async () => ({ events, total: 1 })),
    auditVerify: vi.fn(async () => ({ ok: true, length: 1 })),
  },
}));

function renderAudit() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <AuditRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("AuditRoute (Phase 14 audit trail)", () => {
  it("lists audited actions with actor/resource and marks PHI", async () => {
    renderAudit();
    await waitFor(() => expect(screen.getByText("note.signed")).toBeTruthy());
    expect(screen.getByText(/note:n1/)).toBeTruthy();
    expect(screen.getAllByText("PHI").length).toBeGreaterThan(0);
  });

  it("surfaces the hash-chain integrity status as verified", async () => {
    renderAudit();
    await waitFor(() => expect(screen.getByText(/chain verified/i)).toBeTruthy());
  });
});
