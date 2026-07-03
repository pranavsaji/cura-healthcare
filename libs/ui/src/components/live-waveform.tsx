import { useEffect, useRef } from "react";
import { cn } from "../primitives.js";
import { useReducedMotion } from "../hooks/use-reduced-motion.js";
import type { AudioSignal } from "../three/useAudioAnalyser.js";

/**
 * Lightweight Canvas-2D waveform ribbon driven by the shared audio analyser.
 * No WebGL — safe to render anywhere, immediately, as live "it's listening"
 * feedback. Under reduced motion it draws a single flat baseline (no rAF).
 */
export function LiveWaveform({
  signal,
  className,
  color = "#a7e8c4",
  bars = 48,
}: {
  signal: AudioSignal;
  className?: string;
  color?: string;
  bars?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const gap = w / bars;
      const bw = gap * 0.5;
      const level = signal.level.current;
      const band = signal.bands.current;
      for (let i = 0; i < bars; i++) {
        const src = band.length ? (band[Math.floor((i / bars) * band.length)] ?? 0) / 255 : level;
        // add a little variation so the synthetic/quiet signal still moves
        const amp = Math.max(0.04, src * (0.7 + 0.3 * Math.sin(i * 0.7)));
        const bh = amp * h * 0.9;
        const x = i * gap + (gap - bw) / 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35 + amp * 0.65;
        const y = (h - bh) / 2;
        ctx.fillRect(x, y, bw, bh);
      }
    };

    if (reduced) {
      // single static baseline frame
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, canvas.height / 2 - dpr, canvas.width, dpr * 2);
      return;
    }

    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [signal, color, bars, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("h-full w-full", className)} />;
}
