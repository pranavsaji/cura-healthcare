import type { RiskFlag } from "@cura/shared";
import { cn } from "../primitives.js";

const SEVERITY_STYLES: Record<RiskFlag["severity"], string> = {
  info: "border-line bg-white/5 text-text-mid",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  critical: "border-danger/50 bg-danger/10 text-danger",
};

const KIND_LABELS: Record<RiskFlag["kind"], string> = {
  suicidal_ideation: "Suicidal ideation",
  homicidal_ideation: "Homicidal ideation",
  abuse: "Abuse disclosure",
  mandated_reporting: "Mandated reporting",
};

export interface RiskFlagCardProps {
  flag: RiskFlag;
  className?: string;
}

/**
 * A clinical risk flag surfaced from the transcript. Critical/warning flags use
 * `role="alert"` so assistive tech announces them; info flags are passive.
 */
export function RiskFlagCard({ flag, className }: RiskFlagCardProps) {
  const isUrgent = flag.severity !== "info";
  return (
    <div
      role={isUrgent ? "alert" : undefined}
      className={cn("rounded-lg border p-3", SEVERITY_STYLES[flag.severity], className)}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <span aria-hidden="true">{flag.severity === "critical" ? "▲" : "●"}</span>
        {KIND_LABELS[flag.kind]}
      </div>
      <p className="mt-1 text-sm italic text-text-hi">“{flag.quote}”</p>
    </div>
  );
}
