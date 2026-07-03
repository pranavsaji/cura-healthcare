import { useMemo, useState } from "react";
import { Eyebrow, StatusChip, MotionList, MotionItem, Magnetic } from "@cura/ui";

/**
 * Phase 18 — Curabill billing console: claims, denials, follow-ups, and the
 * explicit **approval step** for money-moving actions. The data is produced by
 * the RCM workflows (`@cura/worker` + `@cura/rcm`) and, in production, surfaced
 * through a tenant-scoped `/billing` API. Presentational + data-driven so it
 * renders from any such source; the demo dataset keeps it self-contained + testable.
 *
 * The approval control here is the UI half of the HITL gate the workflow enforces
 * server-side: **no claim is submitted without a recorded human approval.**
 */
export type ClaimStatus =
  | "needs_correction"
  | "awaiting_approval"
  | "submitted"
  | "paid"
  | "denied";

export interface BillingClaim {
  id: string;
  payer: string;
  amountCents: number;
  status: ClaimStatus;
  /** Pre-denial finding / denial reason (CARC), when relevant. */
  carc?: string;
  reason?: string;
}

const STATUS_TONE: Record<ClaimStatus, "done" | "live" | "processing" | "danger" | "waiting"> = {
  paid: "done",
  submitted: "live",
  awaiting_approval: "processing",
  denied: "danger",
  needs_correction: "waiting",
};

const DEMO_CLAIMS: BillingClaim[] = [
  { id: "CLM-2201", payer: "Aetna", amountCents: 27000, status: "paid" },
  { id: "CLM-2202", payer: "BCBS", amountCents: 15000, status: "awaiting_approval" },
  { id: "CLM-2203", payer: "Cigna", amountCents: 18000, status: "denied", carc: "197", reason: "Prior authorization absent" },
  { id: "CLM-2204", payer: "UHC", amountCents: 12000, status: "needs_correction", carc: "183", reason: "Referring provider required" },
];

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function BillingRoute({ claims: initial = DEMO_CLAIMS }: { claims?: BillingClaim[] }) {
  const [claims, setClaims] = useState(initial);
  const denials = useMemo(() => claims.filter((c) => c.status === "denied"), [claims]);
  const pendingApproval = useMemo(() => claims.filter((c) => c.status === "awaiting_approval"), [claims]);

  const approve = (id: string) =>
    setClaims((cs) => cs.map((c) => (c.id === id ? { ...c, status: "submitted" } : c)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Eyebrow>Billing</Eyebrow>
        <div className="flex gap-2 text-xs text-text-lo" aria-label="Billing summary">
          <span>{denials.length} denials</span>
          <span>· {pendingApproval.length} awaiting approval</span>
        </div>
      </div>

      {pendingApproval.length > 0 && (
        <section aria-label="Approvals" className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
          <h2 className="text-sm font-semibold text-text-hi">Approvals required</h2>
          <p className="mt-1 text-xs text-text-lo">Money-moving actions need an explicit human approval.</p>
          <ul className="mt-3 space-y-2">
            {pendingApproval.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-hi">
                  Submit {c.id} → {c.payer} ({dollars(c.amountCents)})
                </span>
                <Magnetic strength={0.2}>
                  <button
                    onClick={() => approve(c.id)}
                    className="rounded-md bg-mint-400 px-3 py-1 text-xs font-medium text-ink-900 transition-transform hover:-translate-y-0.5 hover:bg-mint-500"
                  >
                    Approve &amp; submit
                  </button>
                </Magnetic>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MotionList className="divide-y divide-line rounded-lg border border-line" ariaLabel="Claims">
        {claims.map((c) => (
          <MotionItem key={c.id} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-bg-700/30">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-text-hi">{c.id}</span>
                <StatusChip tone={STATUS_TONE[c.status]}>{c.status.replace(/_/g, " ")}</StatusChip>
              </div>
              <div className="truncate text-xs text-text-lo">
                {c.payer} · {dollars(c.amountCents)}
                {c.carc && ` · CARC ${c.carc}${c.reason ? ` — ${c.reason}` : ""}`}
              </div>
            </div>
          </MotionItem>
        ))}
      </MotionList>

      {denials.length > 0 && (
        <section aria-label="Denials" className="rounded-lg border border-line p-4">
          <h2 className="text-sm font-semibold text-text-hi">Denials &amp; follow-ups</h2>
          <ul className="mt-3 space-y-1 text-xs text-text-mid">
            {denials.map((d) => (
              <li key={d.id}>
                {d.id}: CARC {d.carc} — {d.reason}. Appeal drafted, awaiting approval.
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
