import { useEffect, useRef } from "react";
import { Button, Eyebrow, cn } from "@cura/ui";
import type { TranscriptSegment } from "@cura/shared";
import type { Phase } from "../useSession.js";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptPanel({
  phase,
  segments,
  partial,
  onPlayDemo,
  onSay,
  onStop,
}: {
  phase: Phase;
  segments: TranscriptSegment[];
  partial: { text: string; speaker: string } | null;
  onPlayDemo: () => void;
  onSay: (text: string, speaker: "clinician" | "client") => void;
  onStop: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments.length, partial]);

  const recording = phase === "recording";

  return (
    <section className="flex h-full flex-col rounded-lg border border-line bg-bg-800/50">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <Eyebrow>Live transcript</Eyebrow>
        {recording && (
          <span className="flex items-center gap-2 text-xs text-mint-400">
            <span className="h-2 w-2 animate-pulse-glow rounded-full bg-mint-400" />
            Capturing
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {segments.length === 0 && !partial && (
          <p className="text-sm text-text-lo">
            Transcript will appear here as the session is captured. Use “Play demo session” to see it live.
          </p>
        )}
        {segments.map((seg, i) => (
          <Line key={i} seg={seg} />
        ))}
        {partial && (
          <div className={cn("opacity-60", partial.speaker === "clinician" ? "text-sage-500" : "text-text-hi")}>
            <span className="text-[11px] uppercase tracking-wider text-text-lo">{partial.speaker}</span>
            <p className="text-sm italic">{partial.text}…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {recording && (
        <div className="space-y-3 border-t border-line px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onPlayDemo}>
              ▶ Play demo session
            </Button>
            <Button variant="ghost" onClick={() => onSay("And how did that make you feel?", "clinician")}>
              + clinician line
            </Button>
            <Button variant="ghost" onClick={() => onSay("I felt anxious and overwhelmed this week.", "client")}>
              + client line
            </Button>
          </div>
          <Button className="w-full" onClick={onStop}>
            ■ End session & write note
          </Button>
        </div>
      )}
    </section>
  );
}

function Line({ seg }: { seg: TranscriptSegment }) {
  const isClinician = seg.speaker === "clinician";
  return (
    <div className="group flex gap-3">
      <span className="mt-1 w-10 shrink-0 font-mono text-[11px] text-text-lo">{fmt(seg.start)}</span>
      <div>
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-wider",
            isClinician ? "text-sage-500" : "text-mint-400",
          )}
        >
          {seg.speaker}
        </span>
        <p className="text-sm leading-relaxed text-text-hi">{seg.text}</p>
      </div>
    </div>
  );
}
