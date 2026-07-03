import { cn } from "../primitives.js";

export interface RecordButtonProps {
  recording: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * The primary capture control. Exposes `aria-pressed` for the recording state
 * and a clear accessible label so it's operable and announced correctly.
 */
export function RecordButton({ recording, onToggle, disabled, className }: RecordButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : "Start recording"}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-medium transition-all duration-200",
        "hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/60 disabled:cursor-not-allowed disabled:opacity-60",
        recording
          ? "bg-danger/15 text-danger"
          : "bg-mint-400 text-ink-900 hover:bg-mint-500 shadow-glow",
        className,
      )}
    >
      {recording && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 animate-pulse-glow rounded-pill bg-danger/20 blur-md"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "relative h-2.5 w-2.5",
          recording ? "animate-pulse-glow rounded-sm bg-danger" : "rounded-full bg-ink-900",
        )}
      />
      {recording ? "Stop" : "Record"}
    </button>
  );
}
