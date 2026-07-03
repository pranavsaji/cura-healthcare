# Cura 3D UI — Detailed Phase Plan (execution-ready)

Companion to `ui-3d-plan.md`. Branch: `feat/ui-3d-lively`.

**Locked decisions:** organic breathing-blob orb (drei `MeshDistortMaterial`),
sage→mint palette with restrained iridescent sheen, ambient-calm intensity in the
product app. Every animated component ships a `prefers-reduced-motion` static fallback.

Legend: **NEW** = new file · **EDIT** = modify existing · ✅ = acceptance criterion.

---

## Phase 0 — Foundation (no visible UI change; fully reversible)

Goal: land the plumbing so every later phase is declarative and a11y-safe.

### 0.1 Dependencies
- `libs/ui`: `three`, `@react-three/fiber`, `@react-three/drei`,
  `@react-three/postprocessing`, `framer-motion`, `maath`, `@types/three` (dev).
- Peer them from `apps/web` + `apps/marketing` (workspace already hoists via pnpm).
- ✅ `pnpm install` clean; `pnpm -w typecheck` green; no bundle shipped yet (nothing imports 3D).

### 0.2 Motion tokens — **EDIT** `libs/ui/src/tokens.css`
- Add ambient keyframes reused app-wide: `float`, `breathe`, `sheen`, `shimmer`,
  `comet` (rail), `count-tick`. Add `--dur-xslow: 1200ms` and `--ease-spring-css`.

### 0.3 Spring vocabulary — **NEW** `libs/ui/src/motion.ts`
```ts
export const springs = {
  snappy: { type: "spring", stiffness: 420, damping: 32 },
  smooth: { type: "spring", stiffness: 180, damping: 26 },
  lazy:   { type: "spring", stiffness: 90,  damping: 20 },
} as const;
export const reveal = { hidden:{opacity:0,y:12,filter:"blur(8px)"}, show:{opacity:1,y:0,filter:"blur(0)"} };
```

### 0.4 Motion primitives — **NEW** `libs/ui/src/motion.tsx`
Each reads `useReducedMotion()` (exists) and no-ops to a plain element when reduced.
- `<MotionReveal as delay stagger>` — `whileInView` + `reveal` variant.
- `<Tilt max=8 glare>` — pointer→CSS `rotateX/rotateY` via `useMotionValue`+`useSpring`.
- `<Magnetic strength=0.3>` — element translates toward cursor, springs back on leave.
- `<Parallax depth>` — pointer/scroll offset × depth.
- `<PageTransition>` — `AnimatePresence` wrapper (blur-in + y-slide, `springs.smooth`).
- `<CountUp value>` — animates number via `useSpring` + `useTransform`.

### 0.5 3D scaffolding — **NEW** `libs/ui/src/three/`
- `Canvas3D.tsx` — lazy `<Canvas>`; `dpr={[1, 2]}`, `<AdaptiveDpr/>`,
  `<PerformanceMonitor>` step-down; `frameloop` flips to `"never"` when off-screen
  (IntersectionObserver) or `document.hidden`. Wrapped in `<Suspense fallback>`.
- `useAudioAnalyser.ts` — takes a `MediaStream | null`, builds `AudioContext` +
  `AnalyserNode`, returns a ref-driven smoothed `{ level: 0..1, bands: Float32Array }`.
  Idle/no-stream → returns synthetic slow-breathing signal so the orb still lives.
- `ReducedMotionFallback.tsx` — static radial-gradient sphere + `pulse-glow` ring (CSS).
- `useLazy3D.ts` — helper: `React.lazy` + capability gate (`saveData`, cores, WebGL probe,
  reduced-motion) → returns fallback component when 3D shouldn't run.

### 0.6 Exports & tests
- **EDIT** `libs/ui/src/index.ts` + `components/index.ts` — export motion primitives;
  keep `three/` behind a separate subpath export so it never enters the base bundle.
- **NEW** `libs/ui/src/motion.spec.tsx` — assert every primitive renders a static element
  and mounts no rAF/canvas under mocked `matchMedia('reduce')`.
- ✅ existing reduced-motion e2e (`apps/marketing/e2e/reduced-motion.spec.ts`) still green.

**Phase 0 exit:** deps in, primitives + scaffolding exported and unit-tested, zero visible
change, typecheck + tests green.

---

## Phase 1 — Ambient life (zero clinical risk)

Goal: the whole product already feels alive using only framer-motion + one cheap shader.
Nothing here blocks reading a note; all calm and slow.

### 1.1 `<MeshGradientBg>` — **NEW** `libs/ui/src/three/MeshGradientBg.tsx`
- Full-bleed fragment-shader mesh gradient (sage/mint/amber over `--bg-900`), slow drift,
  film grain reusing the existing `.grain` overlay. `frameloop="demand"` ~30fps cap.
- Reduced-motion / low-power → static CSS radial-gradient (current look).
- **EDIT** `apps/web/src/features/AppShell.tsx` — mount as fixed `-z-10` layer behind `<main>`.

### 1.2 Route transitions — **EDIT** `apps/web/src/features/AppShell.tsx` + `router.tsx`
- Wrap `<Outlet/>` in `<PageTransition>` keyed by `location.pathname`.
- ✅ back/forward + nav clicks animate; reduced-motion = instant swap.

### 1.3 Living pipeline rail — **EDIT** `apps/web/src/components/Chrome.tsx`
- `PipelineRail`: `motion` chips with `layout`; a glowing **comet** (`layoutId`) slides to
  the active step; passed steps get a settle pop. `StatusChip` dot breathes.
- ✅ phase idle→recording→writing→ready reads as continuous motion.

### 1.4 Dashboard aliveness — **EDIT** `apps/web/src/routes/dashboard.tsx`
- Stagger-in list rows (`MotionReveal stagger`); each row wrapped in `<Tilt max=6>` +
  spotlight sheen on hover. `layoutId` on the row → shared-element into session detail.
- `<CountUp>` for any session counts; empty-state gets a slow floating illustration.

### 1.5 Card depth — **EDIT** `libs/ui/src/components/note-section-card.tsx`,
`risk-flag-card.tsx`
- Add optional `interactive` prop → `<Tilt>` + sheen. Risk flags do a one-time
  attention shake+glow on first mount (respects reduced-motion).

**Phase 1 exit:** navigating the app feels fluid and dimensional; Lighthouse perf ≥ prior;
reduced-motion visually static; a11y tests green.

---

## Phase 2 — The signature moment (the orb)

Goal: the audio-reactive breathing orb anchors the capture flow.

### 2.1 `<RecordOrb>` — **NEW** `libs/ui/src/three/RecordOrb.tsx`
- Icosahedron geometry + drei `MeshDistortMaterial` (organic blob), mint emissive,
  subtle iridescent env sheen (`drei` `<Environment preset>` low-intensity, cached).
- `<Bloom>` from `@react-three/postprocessing` (hero-only).
- Props: `phase: Phase`, `level: number` (from analyser), `reducedMotion`.
- Behavior by phase (drives `distort`, `speed`, emissive color, rotation):
  - `idle/consent`: slow breathe, mint, gentle spin.
  - `recording`: `distort` + emissive scale with `level`; louder = more turbulence + bloom.
  - `writing`: color sage→amber, faster spin, inward particle convergence.
  - `ready`: settle; one outward particle bloom ring; soft steady pulse.
- Mouse-parallax camera (`<Parallax>`-equivalent inside the canvas).
- Reduced-motion → `ReducedMotionFallback` (static distorted-sphere gradient + CSS ring).

### 2.2 Audio wiring — **EDIT** `apps/web/src/useSession.ts`
- Expose the mic `MediaStream` (add `streamRef`/`getStream()`); when live capture starts
  (Phase 07 WS), feed it to `useAudioAnalyser`. Demo mode → synthetic level from the
  `playDemo` cadence so the orb reacts even without a mic.
- ✅ orb reacts to real speech amplitude when miked; reacts to demo lines otherwise.

### 2.3 Mount in capture flow — **EDIT** `apps/web/src/routes/record.tsx`
- Center the orb above/between the transcript + note columns (or as a hero band on `idle`).
- Keep the existing `RecordButton` as the real, focusable a11y control; orb is `aria-hidden`
  decoration layered with it. **EDIT** `libs/ui/src/components/record-button.tsx` →
  optional orb slot + `<Magnetic>` press feel.

### 2.4 Live waveform (cheap 2D) — **NEW** `libs/ui/src/components/LiveWaveform.tsx`
- Canvas-2D ribbon from the same analyser; drop into `TranscriptPanel` "Capturing" header.
- **EDIT** `apps/web/src/components/TranscriptPanel.tsx` — replace the single pulse dot
  with the waveform while `recording`; new transcript lines spring/blur-in.

**Phase 2 exit:** starting a capture shows a living, sound-reactive orb + waveform; the note
stays perfectly readable; reduced-motion shows a calm static orb; WebGL is code-split and
paused when the tab is hidden.

---

## Phase 3 — Marketing showcase (Next.js)

Goal: the landing page is the flagship demo of the aesthetic.

- **EDIT** `apps/marketing/app/page.tsx` + `components/ProductPage.tsx`:
  full-viewport `<Canvas3D>` hero with `<RecordOrb>` (demo phase loop) + `<MeshGradientBg>`
  + `<ParticleFlow>`; headline blur-in; multi-layer mouse parallax.
- **NEW** `libs/ui/src/three/ParticleFlow.tsx` — instanced GPU particles drifting along the
  brand flow curve (3D successor to `FlowLine`); used in hero + app empty states.
- Scroll story — **EDIT** reuse `SmoothScroll` + framer `useScroll`: camera dolly on the
  orb, section reveals with depth as you scroll.
- **EDIT** `components/Marquee.tsx` — 3D perspective skew; feature cards get `<Tilt>`.
- ✅ `apps/marketing/e2e/{reduced-motion,a11y,nav}.spec.ts` all green; LCP hero image/poster
  fallback so first paint isn't blocked on WebGL.

---

## Phase 4 — Polish, performance & a11y hardening

- Micro-interactions sweep: `<Magnetic>` on primary buttons, card sheens, `<CountUp>` on all
  stats, transcript shimmer, toast/route choreography.
- Perf: verify code-split boundaries (no `three` in base chunk), `PerformanceMonitor`
  step-down thresholds, DPR clamp, particle counts by `hardwareConcurrency`, pause-when-hidden.
- Capability gates verified: `saveData`, no-WebGL, reduced-motion, low-core → static paths.
- a11y audit: orbs/particles `aria-hidden`; all controls keyboard-focusable + labeled; no
  meaning conveyed by motion/color alone; run existing axe e2e + extend to new components.
- Cross-device QA (Safari/iOS, low-end Android, Firefox); reduced-motion visual snapshot.
- ✅ Lighthouse perf ≥ baseline on product routes; all e2e green; bundle report reviewed.

---

## Sequencing & checkpoints

1. **Phase 0** → I build + typecheck + unit test, then pause for your review (nothing visible).
2. **Phase 1** → screenshot/GIF walkthrough for sign-off before touching the capture flow.
3. **Phase 2** → the orb; demo via `Play demo session` so it's visible without a mic.
4. **Phases 3–4** → after product surfaces are approved.

Each phase is its own commit on `feat/ui-3d-lively`; reduced-motion + a11y tests gate every one.
