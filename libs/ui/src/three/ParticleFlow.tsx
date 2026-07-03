import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";
import { Canvas3D } from "./Canvas3D.js";

/* A drifting field of GPU points strung along the signature Cura "flow" sine
   curve — the 3D successor to the 2D FlowLine. Purely ambient depth. */

const COUNT_BY_TIER = { low: 400, mid: 1200, high: 2600 } as const;

function Field({ count, color }: { count: number; color: string }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const curve = Math.sin(x * 0.6) * 0.9; // the flow line
      const y = curve + (Math.random() - 0.5) * 1.6;
      const z = (Math.random() - 0.5) * 4;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    const pts = ref.current;
    if (!pts) return;
    pts.rotation.y += delta * 0.04;
    const t = state.clock.elapsedTime;
    pts.position.y = Math.sin(t * 0.3) * 0.15;
  });

  return (
    <Points ref={ref} positions={positions} stride={3}>
      <PointMaterial transparent color={color} size={0.02} sizeAttenuation depthWrite={false} opacity={0.8} />
    </Points>
  );
}

export function ParticleFlowScene({
  className,
  color = "#a7e8c4",
  tier = "mid",
}: {
  className?: string;
  color?: string;
  tier?: "low" | "mid" | "high";
}) {
  return (
    <Canvas3D className={className} camera={{ position: [0, 0, 6], fov: 55 }}>
      <Field count={COUNT_BY_TIER[tier]} color={color} />
    </Canvas3D>
  );
}
