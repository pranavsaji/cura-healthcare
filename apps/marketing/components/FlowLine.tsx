"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The signature animated flow line — a sine-wave path with a glowing dot that
 * travels along it, connecting the three products. Reduced-motion safe.
 */
export function FlowLine() {
  const [t, setT] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setT(0.5);
      return;
    }
    let start: number | null = null;
    const loop = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = (ts - start) / 6000; // 6s per pass
      setT(elapsed % 1);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const W = 1200;
  const H = 200;
  const path = sinePath(W, H);
  const { x, y } = pointOnSine(t, W, H);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full" fill="none" preserveAspectRatio="none">
      <defs>
        <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8fb89b" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#a7e8c4" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8fb89b" stopOpacity="0.2" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={path} stroke="url(#flow)" strokeWidth="1.5" />
      <circle cx={x} cy={y} r="5" fill="#a7e8c4" filter="url(#glow)" />
    </svg>
  );
}

function sinePath(w: number, h: number) {
  const pts: string[] = [];
  for (let i = 0; i <= w; i += 8) {
    const y = h / 2 + Math.sin((i / w) * Math.PI * 3) * (h / 3);
    pts.push(`${i === 0 ? "M" : "L"} ${i} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function pointOnSine(t: number, w: number, h: number) {
  const x = t * w;
  const y = h / 2 + Math.sin((x / w) * Math.PI * 3) * (h / 3);
  return { x, y };
}
