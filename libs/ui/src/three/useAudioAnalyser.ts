import { useEffect, useRef } from "react";

export interface AudioSignal {
  /** Smoothed overall loudness, 0..1. Read every frame from the render loop. */
  level: { current: number };
  /** Raw frequency magnitudes (0..255), length = fftSize/2. */
  bands: { current: Uint8Array };
}

/**
 * Wraps a WebAudio AnalyserNode over a live mic `MediaStream`. Exposes ref
 * objects (not React state) so the r3f render loop can read amplitude every
 * frame without re-rendering React. When there is no stream it emits a gentle
 * synthetic "breathing" level so decorative visuals still feel alive (e.g. the
 * marketing demo or before the mic is granted).
 *
 * `active` gates the synthetic fallback: pass false to hold the signal at rest.
 */
export function useAudioAnalyser(stream: MediaStream | null, active = true): AudioSignal {
  const level = useRef(0);
  const bands = useRef<Uint8Array>(new Uint8Array(0));

  useEffect(() => {
    // Real analysis path.
    if (stream) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      bands.current = buf;
      let raf = 0;
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] ?? 0;
        const next = sum / buf.length / 255; // 0..1
        level.current += (next - level.current) * 0.25; // extra smoothing
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(raf);
        src.disconnect();
        void ctx.close();
      };
    }

    // Synthetic breathing fallback (no mic).
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.016;
      const target = active ? 0.28 + Math.sin(t * 1.6) * 0.12 + Math.sin(t * 0.7) * 0.06 : 0.05;
      level.current += (target - level.current) * 0.08;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stream, active]);

  return { level, bands };
}
