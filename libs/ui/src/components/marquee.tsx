import type { ReactNode } from "react";
import { cn } from "../primitives.js";
import { useReducedMotion } from "../hooks/use-reduced-motion.js";

export interface MarqueeProps {
  children: ReactNode;
  className?: string;
  /** Pause the scroll on hover (default true). */
  pauseOnHover?: boolean;
}

/**
 * Infinite horizontal marquee. Content is duplicated so the loop is seamless.
 * Under reduced-motion the translation is disabled (static row), and the track
 * exposes `data-animated` so tests + hover styling can key off it.
 */
export function Marquee({ children, className, pauseOnHover = true }: MarqueeProps) {
  const reducedMotion = useReducedMotion();
  const animated = !reducedMotion;

  return (
    <div className={cn("group overflow-hidden", className)} data-testid="marquee">
      <div
        data-animated={animated ? "true" : "false"}
        className={cn(
          "flex w-max gap-8",
          animated && "animate-marquee",
          animated && pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
      >
        <div className="flex shrink-0 gap-8" aria-hidden={false}>
          {children}
        </div>
        {/* Duplicate for a seamless loop; hidden from a11y tree. */}
        <div className="flex shrink-0 gap-8" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
