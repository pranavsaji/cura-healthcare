"use client";

import type { ReactNode } from "react";
import { Tilt } from "@cura/ui";

/** Thin client wrapper so server components can drop a pointer-tilt card in.
 *  Degrades to a plain container under reduced motion (handled inside Tilt). */
export function TiltCard({
  children,
  className,
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  return (
    <Tilt max={max} glare className={className}>
      {children}
    </Tilt>
  );
}
