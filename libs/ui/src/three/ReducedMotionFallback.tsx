import { cn } from "../primitives.js";

/**
 * Static stand-in rendered wherever a 3D scene is suppressed (reduced motion,
 * Save-Data, no WebGL). A calm radial "orb" with a soft ring — no animation,
 * no canvas — so the layout and mood survive without motion.
 */
export function ReducedMotionFallback({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      className={cn("relative grid aspect-square w-full place-items-center", className)}
      role="img"
      aria-label={label ?? "Cura"}
    >
      <div
        className="h-2/3 w-2/3 rounded-full shadow-glow"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, var(--mint-400), var(--sage-500) 55%, var(--bg-700) 100%)",
        }}
      />
      <div className="absolute h-2/3 w-2/3 rounded-full border border-mint-400/25" />
    </div>
  );
}
