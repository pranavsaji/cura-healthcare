import { Suspense, lazy } from "react";
import { useCanRender3D, ReducedMotionFallback, type AudioSignal } from "@cura/ui";
import type { Phase } from "../useSession.js";

/** WebGL orb loaded lazily so `three` stays out of the main bundle. */
const RecordOrbScene = lazy(() => import("@cura/ui/three").then((m) => ({ default: m.RecordOrbScene })));

/**
 * The signature capture visual: an audio-reactive breathing orb that shifts
 * with the session phase. Gated by device capability; falls back to a calm
 * static orb under reduced motion / low-power / no-WebGL.
 */
export function OrbStage({ phase, signal }: { phase: Phase; signal: AudioSignal }) {
  const can3D = useCanRender3D();
  const fallback = <ReducedMotionFallback className="mx-auto max-w-[220px]" label="Cura capture" />;

  if (!can3D) return fallback;

  return (
    <div className="mx-auto aspect-square w-full max-w-[260px]">
      <Suspense fallback={fallback}>
        <RecordOrbScene phase={phase} level={signal.level} />
      </Suspense>
    </div>
  );
}
