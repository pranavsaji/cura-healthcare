import type { TranscriptSegment } from "@cura/shared";
import { cn } from "../primitives.js";

export interface TranscriptLineProps {
  segment: TranscriptSegment;
  className?: string;
}

const SPEAKER_LABELS: Record<TranscriptSegment["speaker"], string> = {
  clinician: "Clinician",
  client: "Client",
  unknown: "Speaker",
};

/** Format seconds as m:ss for the evidence timestamp. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A single diarized transcript line with speaker, timestamp, and low-confidence hint. */
export function TranscriptLine({ segment, className }: TranscriptLineProps) {
  const lowConfidence = segment.confidence < 0.6;
  return (
    <p className={cn("flex gap-3 text-sm leading-relaxed", className)}>
      <span className="shrink-0 font-mono text-xs text-text-lo" aria-hidden="true">
        {formatTime(segment.start)}
      </span>
      <span>
        <span
          className={cn(
            "mr-2 font-medium",
            segment.speaker === "clinician" ? "text-mint-400" : "text-text-mid",
          )}
        >
          {SPEAKER_LABELS[segment.speaker]}:
        </span>
        <span className={cn("text-text-hi", lowConfidence && "opacity-70")}>{segment.text}</span>
        {lowConfidence && (
          <span className="ml-1 text-[11px] text-amber-400" title="Low confidence">
            (unclear)
          </span>
        )}
      </span>
    </p>
  );
}
