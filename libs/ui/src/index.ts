export * from "./primitives.js";
export * from "./hooks/index.js";
export * from "./components/index.js";
export * from "./springs.js";
export * from "./motion.js";
export { default as tailwindPreset } from "./tailwind-preset.js";

/* 3D capability gates + fallback are safe for the base bundle (no `three`
   import). The actual WebGL <Canvas3D> and scenes live behind `@cura/ui/three`. */
export { useCanRender3D, useDetailTier } from "./three/useLazy3D.js";
export { useAudioAnalyser, type AudioSignal } from "./three/useAudioAnalyser.js";
export { ReducedMotionFallback } from "./three/ReducedMotionFallback.js";
