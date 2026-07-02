import { useEffect, useRef, useState } from "react";
import { cn } from "../primitives.js";
import { useReducedMotion } from "../hooks/use-reduced-motion.js";

export interface FlowLineProps {
  className?: string;
  /** Full width of the SVG viewport. */
  width?: number;
  height?: number;
  /** Seconds for the glow to travel the full path. */
  durationSec?: number;
}

/**
 * The signature animated sine "flow line": a soft glow travels along an SVG
 * path via requestAnimationFrame. Under `prefers-reduced-motion: reduce` it
 * renders a single static frame — no rAF loop — satisfying the a11y mandate.
 */
export function FlowLine({ className, width = 600, height = 120, durationSec = 6 }: FlowLineProps) {
  const reducedMotion = useReducedMotion();
  const [t, setT] = useState(0); // 0..1 progress along the path
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) return; // static frame, no animation loop
    let start: number | null = null;
    const step = (ts: number) => {
      start ??= ts;
      const elapsed = (ts - start) / 1000;
      setT((elapsed / durationSec) % 1);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion, durationSec]);

  // Sine path across the viewport.
  const mid = height / 2;
  const amp = height / 3;
  const path = buildSinePath(width, mid, amp);
  const progress = reducedMotion ? 0.5 : t;
  const cx = progress * width;
  const cy = mid + amp * Math.sin(((progress * width) / width) * Math.PI * 4);

  return (
    <svg
      data-testid="flow-line"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      role="presentation"
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-auto w-full", className)}
    >
      <path d={path} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} />
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="var(--mint-400)"
        className="drop-shadow-[0_0_8px_var(--mint-400)]"
      />
    </svg>
  );
}

function buildSinePath(width: number, mid: number, amp: number): string {
  const steps = 48;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = mid + amp * Math.sin((x / width) * Math.PI * 4);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}
