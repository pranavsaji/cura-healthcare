# Cura — Lively 3D & Interactive UI Plan

**Goal:** Turn the current flat, static UI into a *living* interface — dimensional,
audio-reactive, motion-rich — without breaking the "calm-tech" clinical ethos or the
`prefers-reduced-motion` a11y mandate.

**Decisions locked:** Both surfaces (marketing + product app), phased. Real WebGL
(react-three-fiber) for hero moments; framer-motion + CSS 3D for everyday interactions.

---

## 1. Design references (the bar we're aiming for)

Study these before/while building. Each maps to a specific Cura surface.

| Reference | What to steal | Applies to |
|---|---|---|
| **Vercel / Next.js homepage** | Depth via layered gradients + subtle GPU grain; restraint | Marketing hero background |
| **Linear** | Spring-based micro-interactions, buttery route transitions, "everything nudges" | Product app everywhere |
| **Family.co / Rauno Freiberg** | Physics-based, tactile controls; magnetic buttons; spatial feel | RecordButton, cards |
| **Stripe / press "3D" gradient meshes** | Animated mesh-gradient blobs behind content | Both, section backgrounds |
| **Kurzgesagt / audio-viz orbs** | Audio-reactive geometry that *breathes* with sound | The Record orb (signature moment) |
| **Apple product pages** | Scroll-driven camera + reveal choreography | Marketing scroll story |
| **Arc browser** | Playful but calm; color as energy, not noise | Overall tone guardrail |

**North-star signature moment:** a 3D **audio-reactive orb** at the center of the
capture flow that pulses, distorts, and shifts color with the clinician's live mic
input — the visual proof that Cura is *listening*.

---

## 2. Tech stack additions

Installed into `libs/ui` (shared) + `apps/web` and `apps/marketing`:

| Package | Purpose | Load strategy |
|---|---|---|
| `three` | WebGL engine | code-split, lazy |
| `@react-three/fiber` | React renderer for three.js | lazy via `React.lazy` + `Suspense` |
| `@react-three/drei` | Helpers (shaders, environment, `<Float>`) | tree-shaken |
| `@react-three/postprocessing` | Bloom/glow on the orb | lazy, hero-only |
| `framer-motion` | Springs, layout animation, gestures, page transitions | eager (small, used everywhere) |
| `maath` | Easing/noise math for particle fields | tiny util |

Budget: R3F bundle (~150kb gz) is **code-split** and only loaded on routes that use it.
framer-motion (~40kb gz) is shared and eager. Everyday UI never pays the WebGL cost.

**Non-negotiable:** every WebGL/motion component ships a `prefers-reduced-motion`
fallback — a static, styled frame (matching the existing FlowLine pattern in
`libs/ui/src/components/flow-line.tsx`). Existing reduced-motion e2e tests must stay green.

---

## 3. Foundational layer (do first — everything else builds on it)

### 3.1 Motion tokens (`libs/ui/src/tokens.css`)
Extend the existing `--ease-*` / `--dur-*` tokens with a **spring** vocabulary so
framer-motion configs are centralized, not scattered:

```
--spring-snappy:  { stiffness: 420, damping: 32 }   // buttons, chips
--spring-smooth:  { stiffness: 180, damping: 26 }   // cards, panels
--spring-lazy:    { stiffness: 90,  damping: 20 }    // hero, parallax
```
Export a `springs` object from `libs/ui/src/motion.ts` (TS constants, since CSS can't
hold framer spring config).

### 3.2 Motion primitives (`libs/ui/src/motion.tsx`)
Reusable wrappers so pages stay declarative and reduced-motion is handled once:
- `<MotionReveal>` — replaces/augments `use-in-view-reveal` with framer `whileInView`
- `<Tilt>` — pointer-driven CSS 3D perspective tilt (magnetic, spring-damped)
- `<Magnetic>` — element leans toward cursor (buttons, the record control)
- `<Parallax depth={n}>` — layered scroll/pointer parallax
- `<PageTransition>` — shared route enter/exit (blur-in + y-slide, reusing `blur-in`)
All read `useReducedMotion()` (already exists at `libs/ui/src/hooks/use-reduced-motion.ts`)
and no-op to static when reduced.

### 3.3 3D scaffolding (`libs/ui/src/three/`)
- `Canvas3D.tsx` — lazy `<Canvas>` wrapper with Suspense, DPR clamp, `frameloop="demand"`
  when idle, auto-pause when tab hidden / off-screen (IntersectionObserver).
- `useAudioAnalyser.ts` — wraps WebAudio `AnalyserNode`, returns a smoothed amplitude/FFT
  signal from the existing mic stream (`useSession`) for the orb.
- `ReducedMotionFallback.tsx` — static SVG/gradient stand-in.

---

## 4. Signature 3D components

### 4.1 `<RecordOrb>` — the hero of the product (Phase 2)
A shader-based sphere (icosahedron + custom vertex displacement / drei `MeshDistortMaterial`)
that lives in the capture flow.
- **Idle:** slow breathing distortion, mint glow, gentle rotation.
- **Listening:** distortion amplitude + emissive intensity driven by live mic amplitude
  (`useAudioAnalyser`). Louder speech = more turbulence + brighter bloom.
- **Writing:** color shifts sage→amber, rotation speeds, particles converge inward.
- **Ready:** settles, soft pulse, a ring of particles blooms outward once.
- Mouse parallax on the camera for depth.
- Reduced-motion: static distorted sphere PNG/SVG with a CSS pulse-glow ring.
Replaces the flat `RecordButton` as the centerpiece (button remains as the a11y control /
click target layered over or beside the orb).

### 4.2 `<MeshGradientBg>` — animated backdrop (Phase 1)
GPU animated mesh-gradient (sage/mint/amber over `--bg-900`) with film grain. Drop-in
behind heroes on both marketing and the app shell. Cheap fragment shader, `frameloop`
throttled. Reduced-motion → static gradient (the current look).

### 4.3 `<ParticleFlow>` — ambient depth (Phase 3)
Instanced GPU particles drifting along the brand "flow line" curve — a 3D evolution of the
existing 2D `FlowLine`. Used in marketing hero + empty states in the app.

### 4.4 `<Live Waveform>` (2D canvas, cheap) (Phase 2)
Real-time audio waveform ribbon in `TranscriptPanel` while recording — immediate "it's
alive" feedback even before the orb loads. Canvas 2D, no WebGL cost.

---

## 5. Everyday interaction upgrades (framer-motion, whole product)

These make the app feel alive without any 3D cost — highest ROI per byte.

- **Route transitions:** `<PageTransition>` on all `apps/web` routes (blur-in + slide).
- **Pipeline rail (`Chrome.tsx`):** animate chips between states with `layout` + spring;
  a glowing "comet" travels the rail as phase advances (living version of PipelineRail).
- **Dashboard list (`dashboard.tsx`):** stagger-in rows, `layoutId` shared-element
  transition into the session detail; hover lifts card in 3D (`<Tilt>`).
- **Cards (`note-section-card`, `risk-flag-card`):** pointer tilt + spotlight sheen;
  risk flags do an attention "shake+glow" on first appear.
- **Buttons / RecordButton:** `<Magnetic>` + press-scale spring; recording state gets a
  pulsing danger halo.
- **Transcript lines:** each new segment springs in + subtle blur-in; partial text shimmer.
- **StatusChips:** animated tone transitions, live dot with breathing glow.
- **Numbers/counters:** count-up animation on dashboard stats.

---

## 6. Marketing site (Next.js) — the showcase

- **Hero:** full-viewport `<Canvas3D>` with `<RecordOrb>` (demo mode) + `<MeshGradientBg>`
  + `<ParticleFlow>`; headline does blur-in; mouse-parallax on all layers.
- **Scroll story:** scroll-driven choreography (framer `useScroll`) — camera dolly on the
  orb, sections reveal with depth; reuse existing `SmoothScroll`.
- **Feature cards:** 3D tilt + parallax; the existing `Marquee` gets a 3D perspective skew.
- **FlowLine → 3D:** upgrade the signature line to `<ParticleFlow>` on capable devices.
- Keep `apps/marketing/e2e/reduced-motion.spec.ts` + `a11y.spec.ts` green.

---

## 7. Performance & accessibility guardrails

- **Code-split all WebGL** — `React.lazy(() => import(...))`; never in the base bundle.
- **Adaptive quality:** DPR clamp (max 2), lower particle counts on low-core devices
  (`navigator.hardwareConcurrency`), `drei` `<AdaptiveDpr>` / `<PerformanceMonitor>`.
- **Pause when unseen:** IntersectionObserver + `document.hidden` → stop the render loop.
- **`prefers-reduced-motion`:** every animated component has a static fallback; this is
  already enforced by tests — extend those tests to the new components.
- **Battery/save-data:** respect `navigator.connection.saveData` → static mode.
- **Clinical calm:** motion is *ambient and slow* in the product app (this is a medical
  tool). Save the energetic stuff for marketing. No motion that impedes reading a note.
- **a11y:** orb is decorative (`aria-hidden`); the real `<button>` control stays keyboard-
  focusable and labeled. No information conveyed by motion/color alone.

---

## 8. Phased rollout

**Phase 0 — Foundation (no visible change yet)**
Install deps; add motion tokens + `springs`; build `libs/ui/src/motion.tsx` primitives and
`three/` scaffolding (`Canvas3D`, `useAudioAnalyser`, fallback). Wire reduced-motion tests.

**Phase 1 — Ambient life, zero risk**
`<MeshGradientBg>` behind app shell + marketing hero. framer route transitions. Dashboard
stagger + tilt. Pipeline-rail comet. → App already feels alive; still fully calm/accessible.

**Phase 2 — The signature moment**
`<RecordOrb>` + `useAudioAnalyser` wired to live mic in the capture flow. Live waveform in
TranscriptPanel. Phase-driven orb states. This is the "wow."

**Phase 3 — Marketing showcase**
Full hero scene, scroll choreography, `<ParticleFlow>`, 3D marquee/feature cards.

**Phase 4 — Polish pass**
Micro-interactions everywhere (magnetic buttons, card sheens, count-ups), perf tuning
(`PerformanceMonitor`, adaptive DPR), cross-device QA, a11y audit, reduced-motion snapshot.

---

## 9. Files touched (map)

- `libs/ui/src/tokens.css` — motion/spring tokens
- `libs/ui/src/motion.ts` / `motion.tsx` — springs + primitives (NEW)
- `libs/ui/src/three/*` — Canvas3D, RecordOrb, MeshGradientBg, ParticleFlow, useAudioAnalyser (NEW)
- `libs/ui/src/components/record-button.tsx` — integrate orb + magnetic
- `libs/ui/src/index.ts` / `components/index.ts` — exports
- `apps/web/src/routes/*` — PageTransition, dashboard/list motion
- `apps/web/src/components/Chrome.tsx` — living pipeline rail
- `apps/web/src/components/TranscriptPanel.tsx` — live waveform
- `apps/web/src/routes/record.tsx` — mount RecordOrb in capture flow
- `apps/marketing/app/page.tsx` + `components/*` — hero scene, scroll story
- Package.json files (web, marketing, libs/ui) — new deps

---

## 10. Open choices to confirm before Phase 2

1. **Orb aesthetic:** organic blob (MeshDistortMaterial) vs. faceted crystal vs. particle
   cloud. (Recommend organic blob — matches "calm-tech / breathing".)
2. **Color energy:** keep strictly to sage/mint/amber tokens, or introduce a subtle
   iridescent gradient for the orb only?
3. **Product-app intensity:** ambient-calm (recommended for clinicians) vs. more energetic.
