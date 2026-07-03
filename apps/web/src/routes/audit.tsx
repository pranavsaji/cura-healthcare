import { useState } from "react";
import { Link } from "react-router-dom";
import { Eyebrow, StatusChip, MotionList, MotionItem } from "@cura/ui";
import { useAudit, useAuditVerify } from "../state/queries.js";

/**
 * Phase 14 audit trail: a live, filterable ticker of every audited action on the
 * org's data, plus the hash-chain integrity badge (verified / broken-at). Reads
 * the tenant-scoped `/audit` API — an admin monitors and audits any agent/user
 * action. Content is metadata only (no PHI).
 */
export function AuditRoute() {
  const [action, setAction] = useState("");
  const { data, isLoading } = useAudit(action ? { action } : undefined);
  const { data: chain } = useAuditVerify();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Eyebrow>Audit trail</Eyebrow>
        {chain && (
          <StatusChip tone={chain.ok ? "done" : "live"} aria-label="audit-chain-status">
            {chain.ok ? `chain verified · ${chain.length}` : `chain broken @ ${chain.brokenAt}`}
          </StatusChip>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label="Filter by action"
          placeholder="Filter by action (e.g. note.signed)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-72 rounded-md border border-line bg-bg-800/60 px-3 py-1.5 text-sm text-text-hi outline-none focus:border-mint-400"
        />
        {action && (
          <button className="text-xs text-text-lo hover:text-text-hi" onClick={() => setAction("")}>
            clear
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-text-lo">Loading audit events…</p>
      ) : (
        <MotionList className="divide-y divide-line rounded-lg border border-line" ariaLabel="Audit events">
          {(data?.events ?? []).map((e) => (
            <MotionItem key={e.id} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-bg-700/30">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-text-hi">{e.action}</span>
                  {e.phiTouched && <StatusChip tone="live">PHI</StatusChip>}
                </div>
                <div className="truncate text-xs text-text-lo">
                  {e.actor} → <Link className="text-mint-400 hover:underline" to={`/runs/${encodeURIComponent(e.resource)}`}>{e.resource}</Link>
                </div>
              </div>
              <time className="shrink-0 text-xs text-text-lo">{new Date(e.createdAt).toLocaleTimeString()}</time>
            </MotionItem>
          ))}
          {(data?.events?.length ?? 0) === 0 && <li className="px-5 py-6 text-center text-sm text-text-lo">No matching events.</li>}
        </MotionList>
      )}
    </div>
  );
}
