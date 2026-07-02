import { StatusChip } from "@cura/ui";
import type { Phase } from "../useSession.js";

export function Logo() {
  return (
    <div className="flex items-center gap-2 font-display text-lg tracking-tight text-text-hi">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-mint-400 text-ink-900">
        <span className="text-sm font-semibold">S</span>
      </span>
      <span>
        cura<span className="text-text-lo">note</span>
      </span>
    </div>
  );
}

const STEPS: { key: Phase; label: string }[] = [
  { key: "recording", label: "Listening" },
  { key: "writing", label: "Writing note" },
  { key: "ready", label: "Ready" },
];

export function PipelineRail({ phase }: { phase: Phase }) {
  const order: Phase[] = ["idle", "consent", "recording", "writing", "ready"];
  const idx = order.indexOf(phase);
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((step) => {
        const active = phase === step.key;
        const passed = order.indexOf(step.key) < idx;
        const tone = active ? (step.key === "recording" ? "live" : "processing") : passed ? "done" : "standby";
        return (
          <StatusChip key={step.key} tone={tone as never}>
            {step.label}
          </StatusChip>
        );
      })}
    </div>
  );
}

export function TopBar({ phase, clientLabel }: { phase: Phase; clientLabel: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg-900/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-container items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Logo />
          {clientLabel && (
            <span className="hidden text-sm text-text-mid sm:inline">
              Session · <span className="text-text-hi">{clientLabel}</span>
            </span>
          )}
        </div>
        <PipelineRail phase={phase} />
      </div>
    </header>
  );
}
