import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/use-reduced-motion.js";

/**
 * Decides whether real WebGL should run on this device/session. Returns false
 * (→ render the static fallback) when the user prefers reduced motion, has
 * Save-Data on, is on a low-core device, or the browser can't create a WebGL
 * context. Kept in one place so every 3D surface gates identically.
 */
export function useCanRender3D(): boolean {
  const reduced = useReducedMotion();
  const [capable, setCapable] = useState(false);

  useEffect(() => {
    if (reduced) {
      setCapable(false);
      return;
    }
    if (typeof navigator !== "undefined") {
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      if (conn?.saveData) return;
      if ((navigator.hardwareConcurrency ?? 8) < 4) return;
    }
    // Probe WebGL support without leaking the context.
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      setCapable(Boolean(gl));
      const lose = (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      setCapable(false);
    }
  }, [reduced]);

  return capable;
}

/** Recommended particle/detail budget for the current device. */
export function useDetailTier(): "low" | "mid" | "high" {
  const [tier, setTier] = useState<"low" | "mid" | "high">("mid");
  useEffect(() => {
    const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 8) : 8;
    setTier(cores >= 8 ? "high" : cores >= 4 ? "mid" : "low");
  }, []);
  return tier;
}
