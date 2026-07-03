import { Suspense, lazy } from "react";
import { useCanRender3D } from "@cura/ui";

/** Lazy-load the WebGL backdrop only when the device/session can handle it.
 *  `three` stays out of the main bundle behind this dynamic import. */
const MeshGradientBackdrop = lazy(() =>
  import("@cura/ui/three").then((m) => ({ default: m.MeshGradientBackdrop })),
);

/** Ambient brand gradient behind the whole app. Fixed, non-interactive, and
 *  kept low-opacity so notes stay perfectly readable. Falls back to a static
 *  CSS gradient under reduced motion / low-power / no-WebGL. */
export function Backdrop() {
  const can3D = useCanRender3D();

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
      {/* base + static gradient — always present so first paint is instant */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 18% 12%, rgba(127,216,171,0.10), transparent 70%)," +
            "radial-gradient(55% 45% at 85% 20%, rgba(143,184,155,0.08), transparent 70%)," +
            "radial-gradient(60% 60% at 60% 100%, rgba(231,178,122,0.06), transparent 70%)," +
            "var(--bg-900)",
        }}
      />
      {can3D && (
        <Suspense fallback={null}>
          <MeshGradientBackdrop className="absolute inset-0 h-full w-full" opacity={0.45} />
        </Suspense>
      )}
    </div>
  );
}
