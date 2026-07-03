import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Canvas3D } from "./Canvas3D.js";

/* Slowly drifting brand mesh-gradient rendered as a single full-screen shader
   plane. Cheap (one quad, no lights), calm, and ambient — the living backdrop
   behind heroes and the app shell. Colours are the Cura tokens. */

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uBg;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;

  // cheap value noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), u.x),
               mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), u.x), u.y);
  }

  void main(){
    vec2 uv = vUv;
    float t = uTime * 0.04;
    // three drifting blobs
    float a = smoothstep(0.7, 0.0, distance(uv, vec2(0.25 + 0.15*sin(t), 0.35 + 0.12*cos(t*0.8))));
    float b = smoothstep(0.8, 0.0, distance(uv, vec2(0.8 + 0.1*cos(t*0.7), 0.7 + 0.1*sin(t*1.1))));
    float c = smoothstep(0.9, 0.0, distance(uv, vec2(0.55 + 0.2*sin(t*0.5), 0.15 + 0.1*cos(t))));
    float n = noise(uv*3.0 + t) * 0.06;
    vec3 col = uBg;
    col = mix(col, uA, a*0.55);
    col = mix(col, uB, b*0.45);
    col = mix(col, uC, c*0.4);
    col += n;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function GradientPlane({ colors }: { colors: MeshGradientColors }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBg: { value: new THREE.Color(colors.bg) },
      uA: { value: new THREE.Color(colors.a) },
      uB: { value: new THREE.Color(colors.b) },
      uC: { value: new THREE.Color(colors.c) },
    }),
    [colors.bg, colors.a, colors.b, colors.c],
  );
  useFrame((_, delta) => {
    const u = mat.current?.uniforms.uTime;
    if (u) u.value += delta;
  });
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} fragmentShader={FRAG} vertexShader={VERT} uniforms={uniforms} depthTest={false} />
    </mesh>
  );
}

export interface MeshGradientColors {
  bg: string;
  a: string;
  b: string;
  c: string;
}

const DEFAULT_COLORS: MeshGradientColors = {
  bg: "#0c0d0b",
  a: "#7fd8ab",
  b: "#8fb89b",
  c: "#e7b27a",
};

/** Full component: a self-contained animated gradient backdrop. Drop it into a
 *  fixed/absolute -z layer. Meant to be lazy-imported via `@cura/ui/three`. */
export function MeshGradientBackdrop({
  className,
  colors = DEFAULT_COLORS,
  opacity = 1,
}: {
  className?: string;
  colors?: MeshGradientColors;
  opacity?: number;
}) {
  return (
    <div className={className} style={{ opacity }}>
      <Canvas3D dpr={[1, 1.5]}>
        <GradientPlane colors={colors} />
      </Canvas3D>
    </div>
  );
}
