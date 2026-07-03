import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Icosahedron, MeshDistortMaterial, Environment, Float } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { Canvas3D } from "./Canvas3D.js";

export type OrbPhase = "idle" | "consent" | "recording" | "writing" | "ready";

/* Per-phase target look. `distort`/`speed` feed MeshDistortMaterial; colour is
   the emissive/base tint; `spin` is rad/s. `recording` is additionally driven
   by live audio level on top of these baselines. */
const LOOK: Record<OrbPhase, { color: string; distort: number; speed: number; spin: number; glow: number }> = {
  idle: { color: "#7fd8ab", distort: 0.28, speed: 1.2, spin: 0.15, glow: 0.5 },
  consent: { color: "#8fb89b", distort: 0.25, speed: 1.0, spin: 0.12, glow: 0.45 },
  recording: { color: "#a7e8c4", distort: 0.35, speed: 2.2, spin: 0.35, glow: 0.9 },
  writing: { color: "#e7b27a", distort: 0.5, speed: 3.2, spin: 0.6, glow: 1.1 },
  ready: { color: "#7fd8ab", distort: 0.2, speed: 1.0, spin: 0.1, glow: 0.7 },
};

interface OrbProps {
  phase: OrbPhase;
  /** Live 0..1 audio level, read every frame (ref, not state). */
  level?: { current: number };
}

function Orb({ phase, level }: OrbProps) {
  const group = useRef<THREE.Group>(null);
  // MeshDistortMaterial extends MeshStandardMaterial and adds a `distort` scalar.
  const matRef = useRef<THREE.MeshStandardMaterial & { distort: number }>(null);
  const target = LOOK[phase];
  const targetColor = useMemo(() => new THREE.Color(target.color), [target.color]);

  useFrame((_, delta) => {
    const amp = level?.current ?? 0;
    const look = LOOK[phase];
    if (group.current) group.current.rotation.y += delta * (look.spin + amp * 0.6);
    const m = matRef.current;
    if (m) {
      const wantDistort = look.distort + (phase === "recording" ? amp * 0.5 : 0);
      const wantGlow = look.glow + amp * 1.4;
      m.distort += (wantDistort - m.distort) * Math.min(1, delta * 4);
      m.emissiveIntensity += (wantGlow - m.emissiveIntensity) * Math.min(1, delta * 4);
      m.color.lerp(targetColor, Math.min(1, delta * 2));
      m.emissive.lerp(targetColor, Math.min(1, delta * 2));
    }
  });

  return (
    <group ref={group}>
      <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.6}>
        <Icosahedron args={[1, 12]}>
          <MeshDistortMaterial
            ref={matRef as never}
            color={target.color}
            emissive={target.color}
            emissiveIntensity={target.glow}
            distort={target.distort}
            speed={target.speed}
            roughness={0.18}
            metalness={0.35}
            envMapIntensity={0.8}
          />
        </Icosahedron>
      </Float>
    </group>
  );
}

/** Full self-contained orb scene (Canvas + lights + bloom). Lazy-import via
 *  `@cura/ui/three`; gate with useCanRender3D and fall back to
 *  <ReducedMotionFallback> when 3D shouldn't run. */
export function RecordOrbScene({ phase, level, className }: OrbProps & { className?: string }) {
  return (
    <Canvas3D className={className} camera={{ position: [0, 0, 3.2], fov: 45 }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <pointLight position={[-4, -2, -3]} intensity={0.6} color="#a7e8c4" />
      <Environment preset="city" />
      <Orb phase={phase} level={level} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.2} luminanceSmoothing={0.4} />
      </EffectComposer>
    </Canvas3D>
  );
}
