/* WebGL subpath — imported lazily so `three` stays out of the base bundle.
   Import via `@cura/ui/three` (never re-exported from the package root).
   Only modules that actually pull in `three` live here; the cheap capability
   gates + fallback are exported from the package root instead. */
export { Canvas3D } from "./Canvas3D.js";
