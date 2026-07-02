"use client";

import { type ElementType, type ReactNode } from "react";
import { useInViewReveal } from "@cura/ui";

/**
 * Scroll-reveal wrapper built on the shared `useInViewReveal` hook (same design
 * language as the product). Reduced-motion users get the content immediately with
 * no transform/opacity animation — the hook reveals synchronously when
 * `prefers-reduced-motion: reduce` is set, so nothing here animates.
 */
export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delayMs?: number;
}) {
  const { ref, inView } = useInViewReveal<HTMLElement>();
  return (
    <Tag
      ref={ref}
      data-reveal={inView ? "in" : "out"}
      className={`reveal ${inView ? "reveal-in" : "reveal-out"} ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </Tag>
  );
}
