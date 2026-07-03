import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { cn } from "../primitives.js";

/**
 * Shared <Canvas> wrapper for every 3D surface. Guarantees the good-citizen
 * behaviours so decorative WebGL never taxes a clinician's machine:
 *   • DPR clamped to [1, 2] with AdaptiveDpr + PerformanceMonitor step-down
 *   • render loop suspended when the canvas scrolls out of view (IO) or the
 *     tab is hidden — flips frameloop to "never"
 *   • Suspense boundary so async assets (env maps, shaders) don't block paint
 *
 * This module lives behind the `@cura/ui/three` subpath so `three` never enters
 * the base bundle — consumers lazy-import it.
 */
export function Canvas3D({
  children,
  className,
  camera,
  dpr = [1, 2],
}: {
  children: ReactNode;
  className?: string;
  camera?: { position?: [number, number, number]; fov?: number };
  dpr?: [number, number];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(true);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) setInView(e.isIntersecting);
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const active = inView && visible;

  return (
    <div ref={hostRef} className={cn("h-full w-full", className)} aria-hidden="true">
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={degraded ? 1 : dpr}
        camera={{ position: camera?.position ?? [0, 0, 4], fov: camera?.fov ?? 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <PerformanceMonitor onDecline={() => setDegraded(true)} />
        <AdaptiveDpr pixelated />
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
}
