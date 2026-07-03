import { motion } from "framer-motion";
import type { RiskFlag } from "@cura/shared";
import { cn } from "../primitives.js";
import { useReducedMotion } from "../hooks/use-reduced-motion.js";
import { springs } from "../springs.js";

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
  const reduced = useReducedMotion();

  // Urgent flags draw the eye once on arrival (a small settle + glow); calm
  // otherwise. Static under reduced motion.
  const animate =
    reduced || !isUrgent
      ? undefined
      : {
          initial: { opacity: 0, scale: 0.96, x: -6 },
          animate: { opacity: 1, scale: 1, x: [0, -3, 3, 0] },
          transition: springs.snappy,
        };

  return (
    <motion.div
      role={isUrgent ? "alert" : undefined}
      className={cn("rounded-lg border p-3", SEVERITY_STYLES[flag.severity], className)}
      initial={animate?.initial}
      animate={animate?.animate}
      transition={animate?.transition}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <span aria-hidden="true">{flag.severity === "critical" ? "▲" : "●"}</span>
        {KIND_LABELS[flag.kind]}
      </div>
      <p className="mt-1 text-sm italic text-text-hi">“{flag.quote}”</p>
    </motion.div>
  );
}
