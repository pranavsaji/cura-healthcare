import { useMemo, useState } from "react";
import { Eyebrow, StatusChip, MotionList, MotionItem } from "@cura/ui";

/**
 * Phase 17 — Curadesk front-desk console: call log, referral pipeline, and
 * dispositions. The underlying data is produced by the voice app (`@cura/voice-app`)
 * and, in production, surfaced through a tenant-scoped `/frontdesk` API. This view
 * is presentational + data-driven so it renders from any such source; the demo
 * dataset below keeps it self-contained and testable.
 */
export type Disposition = "in_progress" | "qualified" | "booked" | "declined" | "voicemail";

export interface FrontdeskCall {
  id: string;
  from: string;
  receivedAt: string;
  clientLabel: string;
  disposition: Disposition;
  answerLatencyMs: number;
  referral?: { payer: string; reason: string };
  appointmentAt?: string;
}

const DISPOSITION_TONE: Record<Disposition, "done" | "live" | "standby" | "danger"> = {
  booked: "done",
  qualified: "done",
  in_progress: "live",
  voicemail: "standby",
  declined: "danger",
};

const DEMO_CALLS: FrontdeskCall[] = [
  {
    id: "call-1042",
    from: "+1 (555) 018-2277",
    receivedAt: "2026-07-02T14:03:00Z",
    clientLabel: "Caller · new referral",
    disposition: "booked",
    answerLatencyMs: 640,
    referral: { payer: "BCBS", reason: "IOP intake" },
    appointmentAt: "2026-07-10T09:00:00Z",
  },
  {
    id: "call-1041",
    from: "+1 (555) 447-9910",
    receivedAt: "2026-07-02T13:48:00Z",
    clientLabel: "Caller · benefits check",
    disposition: "qualified",
    answerLatencyMs: 720,
    referral: { payer: "Aetna", reason: "Outpatient psych" },
  },
  {
    id: "call-1040",
    from: "+1 (555) 220-1183",
    receivedAt: "2026-07-02T13:31:00Z",
    clientLabel: "Caller · rescheduling",
    disposition: "in_progress",
    answerLatencyMs: 810,
  },
];

export function FrontdeskRoute({ calls = DEMO_CALLS }: { calls?: FrontdeskCall[] }) {
  const [filter, setFilter] = useState<Disposition | "all">("all");
  const shown = useMemo(
    () => (filter === "all" ? calls : calls.filter((c) => c.disposition === filter)),
    [calls, filter],
  );
  const booked = calls.filter((c) => c.disposition === "booked").length;
  const referrals = calls.filter((c) => c.referral).length;
  const slaBreaches = calls.filter((c) => c.answerLatencyMs >= 2000).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Eyebrow>Front desk</Eyebrow>
        <div className="flex gap-2 text-xs text-text-lo" aria-label="Front-desk summary">
          <span>{referrals} referrals</span>
          <span>· {booked} booked</span>
          <span>· {slaBreaches} SLA breaches</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-text-lo" htmlFor="disposition-filter">
          Disposition
        </label>
        <select
          id="disposition-filter"
          aria-label="Filter by disposition"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Disposition | "all")}
          className="rounded-md border border-line bg-bg-800/60 px-3 py-1.5 text-sm text-text-hi outline-none focus:border-mint-400"
        >
          <option value="all">All</option>
          <option value="booked">Booked</option>
          <option value="qualified">Qualified</option>
          <option value="in_progress">In progress</option>
          <option value="voicemail">Voicemail</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      <MotionList className="divide-y divide-line rounded-lg border border-line" ariaLabel="Call log">
        {shown.map((c) => (
          <MotionItem key={c.id} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-bg-700/30">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-text-hi">{c.from}</span>
                <StatusChip tone={DISPOSITION_TONE[c.disposition]}>{c.disposition.replace("_", " ")}</StatusChip>
                {c.answerLatencyMs < 2000 ? (
                  <span className="text-[11px] text-sage-500" aria-label="answered within SLO">
                    {c.answerLatencyMs}ms
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-400" aria-label="SLO breach">
                    {c.answerLatencyMs}ms
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-text-lo">
                {c.clientLabel}
                {c.referral && ` · ${c.referral.payer} — ${c.referral.reason}`}
                {c.appointmentAt && ` · appt ${new Date(c.appointmentAt).toLocaleDateString()}`}
              </div>
            </div>
            <time className="shrink-0 text-xs text-text-lo">{new Date(c.receivedAt).toLocaleTimeString()}</time>
          </MotionItem>
        ))}
        {shown.length === 0 && <li className="px-5 py-6 text-center text-sm text-text-lo">No calls match.</li>}
      </MotionList>
    </div>
  );
}
