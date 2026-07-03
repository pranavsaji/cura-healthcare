"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useCanRender3D, useDetailTier, ReducedMotionFallback } from "@cura/ui";
import type { OrbPhase } from "@cura/ui/three";

/* WebGL scenes are client-only + code-split; they never run on the server and
   never ship in the initial bundle. */
const RecordOrbScene = dynamic(() => import("@cura/ui/three").then((m) => m.RecordOrbScene), { ssr: false });
const ParticleFlowScene = dynamic(() => import("@cura/ui/three").then((m) => m.ParticleFlowScene), { ssr: false });
const MeshGradientBackdrop = dynamic(() => import("@cura/ui/three").then((m) => m.MeshGradientBackdrop), {
  ssr: false,
});

/** Marketing hero: an ambient particle field + brand gradient behind a demo orb
 *  that loops through the capture phases so visitors see Cura "listening". */
export function HeroScene() {
  const can3D = useCanRender3D();
  const tier = useDetailTier();
  const [phase, setPhase] = useState<OrbPhase>("idle");

  // Cinematic phase loop so the orb is always alive on the landing page.
  useEffect(() => {
    if (!can3D) return;
    const seq: OrbPhase[] = ["idle", "recording", "recording", "writing", "ready"];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % seq.length;
      setPhase(seq[i] ?? "idle");
    }, 2600);
    return () => clearInterval(id);
  }, [can3D]);

  // Mouse parallax on the whole scene.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 90, damping: 20 });
  const py = useSpring(my, { stiffness: 90, damping: 20 });
  // Orb layer drifts slightly slower than the particles for depth.
  const ox = useSpring(mx, { stiffness: 60, damping: 18 });
  const oy = useSpring(my, { stiffness: 60, damping: 18 });
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 24);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 24);
  }

  if (!can3D) {
    return (
      <div className="mx-auto aspect-square w-full max-w-[420px]">
        <ReducedMotionFallback label="Cura" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" onPointerMove={onMove}>
      <div className="absolute inset-0 opacity-60">
        <MeshGradientBackdrop className="h-full w-full" opacity={0.5} />
      </div>
      <motion.div className="absolute inset-0" style={{ x: px, y: py }}>
        <ParticleFlowScene className="h-full w-full" tier={tier} />
      </motion.div>
      <motion.div className="absolute inset-0" style={{ x: ox, y: oy }}>
        <RecordOrbScene phase={phase} />
      </motion.div>
    </div>
  );
}
