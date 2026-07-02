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
        "inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/60 disabled:cursor-not-allowed disabled:opacity-60",
        recording
          ? "bg-danger/15 text-danger"
          : "bg-mint-400 text-ink-900 hover:bg-mint-500 shadow-glow",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-2.5",
          recording ? "animate-pulse-glow rounded-sm bg-danger" : "rounded-full bg-ink-900",
        )}
      />
      {recording ? "Stop" : "Record"}
    </button>
  );
}
