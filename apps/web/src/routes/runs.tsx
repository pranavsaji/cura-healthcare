import { useParams } from "react-router-dom";
import { Eyebrow, StatusChip, MotionList, MotionItem } from "@cura/ui";
import { useRun } from "../state/queries.js";

/**
 * Phase 14 run inspector: the ordered steps recorded for one resource (e.g. a
 * note generation) reconstructed from the audit chain — a replay view of what
 * ran, with actor/action/timing. Content is metadata only (no PHI).
 */
export function RunsRoute() {
  const { resource } = useParams<{ resource: string }>();
  const { data, isLoading } = useRun(resource);

  return (
    <div className="space-y-5">
      <Eyebrow>Run inspector</Eyebrow>
      <div className="text-sm text-text-mid">
        Resource: <span className="font-mono text-text-hi">{resource}</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-lo">Loading run…</p>
      ) : (
        <MotionList as="ol" className="relative space-y-4 border-l border-line pl-6" ariaLabel="Run steps">
          {(data?.steps ?? []).map((step, i) => (
            <MotionItem key={step.id} className="relative">
              <span className="absolute -left-[29px] grid h-5 w-5 place-items-center rounded-full border border-line bg-bg-800 text-[10px] text-text-lo">
                {i + 1}
              </span>
              <div className="rounded-md border border-line bg-bg-800/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-hi">{step.action}</span>
                  {step.phiTouched && <StatusChip tone="live">PHI</StatusChip>}
                </div>
                <div className="mt-1 text-xs text-text-lo">
                  {step.actor} · {new Date(step.createdAt).toLocaleString()}
                </div>
                {Object.keys(step.context ?? {}).length > 0 && (
                  <pre className="mt-2 overflow-x-auto rounded bg-bg-900/60 p-2 text-[11px] text-text-mid">
                    {JSON.stringify(step.context, null, 2)}
                  </pre>
                )}
              </div>
            </MotionItem>
          ))}
          {(data?.steps?.length ?? 0) === 0 && <li className="text-sm text-text-lo">No steps recorded for this resource.</li>}
        </MotionList>
      )}
    </div>
  );
}
