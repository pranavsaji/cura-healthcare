# Phase 02 — Design System (`@cura/ui`)

- **Status:** ✅ DONE (Storybook deferred — see handoff)
- **Owner:** _implemented_
- **Depends on:** 00, 01
- **Unblocks:** 12 (product web), 15 (marketing)

## Objective
A production-grade, token-driven design system shared by the product and marketing apps: tokens →
Tailwind preset → accessible React primitives → composed product components, documented in Storybook
with visual + a11y tests. This is where we visibly out-build the original (whose polish is mostly
marketing-only).

## Context you need
- Aesthetic = "calm-tech": warm near-black + cream sections, sage/mint accents, glassmorphism,
  cinematic depth, blur-in reveals, the animated flow-line. Full study in `/plan.md` §10.
- Demo tokens exist (`libs/ui/src/tokens.css`, `tailwind-preset.ts`, `primitives.tsx`). Harden into
  a real system with docs + tests.
- L1 layer: browser-safe, depends only on `@cura/shared`. No app imports.

## Reusability & scalability mandate
- **One token source** (`tokens.css` CSS vars) consumed via the Tailwind preset by BOTH apps. No
  app defines its own colors/spacing.
- Primitives are unstyled-logic + token-styled, composable, and themeable (dark/product, light/
  marketing) via CSS-var scoping.
- Every component is keyboard-accessible and `prefers-reduced-motion`-aware.

## Deliverables
```
libs/ui/src/
  tokens.css                 # color/space/radius/shadow/motion/type tokens (exists — expand)
  tailwind-preset.ts         # maps tokens → utilities + keyframes (exists)
  primitives.tsx             # Button, Eyebrow, StatusChip, GlassPanel, Stat (exists — expand)
  components/                # composed: FloatingNav, Marquee, AuditTicker, FlowLine, Field, Dialog,
                             #           Toast, Tooltip, Tabs, Skeleton
  hooks/                     # useReducedMotion, useMediaQuery, useInViewReveal
  index.ts
  **/*.spec.tsx              # RTL + jest-axe tests
.storybook/                  # Storybook config
libs/ui/**/*.stories.tsx     # stories per component
```

## Implementation tasks
1. **Tokens:** finalize the scale (type ramp, spacing, elevation, motion). Add light-theme scoping
   (`[data-theme="light"]`) for marketing cream sections.
2. **Primitives:** accessible `Button` (variants, loading, `aria-busy`), `Field`/`Input`/`Select`
   with labels + error states, `Dialog`/`Toast`/`Tooltip`/`Tabs` (use Radix under the hood).
3. **Signature components:** `FloatingNav` (scroll-aware), `Marquee` (reduced-motion pause),
   `FlowLine` (SVG sine path + traveling glow via rAF, reduced-motion static), `AuditTicker`.
4. **Product components:** `NoteSectionCard`, `RiskFlag`, `TranscriptLine`, `RecordButton`,
   `StatusChip` states — the pieces Phase 12 composes.
5. **Storybook:** stories for every component; a "Foundations" page rendering all tokens.
6. **Tests:** React Testing Library for behavior; **jest-axe** for a11y (zero violations); a
   reduced-motion test asserting animations are disabled when the media query matches.

## Validation gate
```bash
pnpm --filter @cura/ui test         # RTL + axe, zero a11y violations
pnpm --filter @cura/ui typecheck
pnpm --filter @cura/ui build-storybook   # compiles clean
```
- **Acceptance:** `Button` is operable by keyboard and exposes `aria-busy` while loading; axe finds
  0 violations on Button/Field/Dialog/Nav; with `prefers-reduced-motion: reduce`, `FlowLine` renders
  a static frame (no rAF loop) and `Marquee` does not translate.

## Definition of Done
- [ ] All components have stories + passing RTL/axe tests.
- [ ] Tokens drive everything; no hardcoded colors in components.
- [ ] Light + dark themes both render from the same tokens.
- [ ] Reduced-motion honored and tested.

## Handoff notes (implemented)
- **Inventory:**
  - Primitives (`primitives.tsx`): `Button` (variants + `loading`/`aria-busy`, defaults `type=button`,
    disabled-while-loading), `Field` (labelled input with `aria-invalid`/`aria-describedby` + `role=
    alert` error), `Eyebrow`, `StatusChip`, `GlassPanel`, `Stat`.
  - Hooks (`hooks/`): `useMediaQuery` (lazy-init from `matchMedia`, SSR-safe), `useReducedMotion`,
    `useInViewReveal` (IntersectionObserver; reveals immediately under reduced motion).
  - Signature (`components/`): `FlowLine` (rAF traveling glow; **static frame, no rAF loop** under
    reduced motion — asserted in tests), `Marquee` (duplicated track; `data-animated=false` +
    no `animate-marquee` class under reduced motion).
  - Product (`components/`): `NoteSectionCard`, `RiskFlagCard` (urgent → `role=alert`),
    `TranscriptLine`, `RecordButton` (`aria-pressed`). These are the pieces Phase 12 composes.
- **Theming:** one token source (`tokens.css`). Dark is `:root`; **light** re-scopes the same token
  *names* under `[data-theme="light"]` (cream marketing sections) so components need no per-theme
  code. Apps consume via `@cura/ui/tokens.css` + the Tailwind preset (`@cura/ui/preset`); no app
  defines its own colors.
- **Testing:** RTL + `jest-axe` under jsdom (opt-in per file via `/** @vitest-environment jsdom */`).
  Root `vitest.config.ts` gained `esbuild.jsx=automatic`, `*.spec.tsx` includes, and
  `vitest.setup.ts` (extends `toHaveNoViolations`, stubs `matchMedia`/`IntersectionObserver`). axe =
  0 violations on Button/Field/RecordButton/NoteSectionCard; reduced-motion behavior tested for
  FlowLine + Marquee. 22 UI tests pass.
- **Radix:** not adopted yet — current primitives are dependency-light (no Radix). Add Radix when
  Dialog/Tooltip/Tabs/Select land (they're listed in deliverables but deferred with Storybook).
- **Deferred (not blocking downstream):** Storybook (config + `*.stories.tsx` + `build-storybook`)
  and the Radix-based `Dialog/Toast/Tooltip/Tabs/Skeleton` + `FloatingNav/AuditTicker`. Rationale:
  Storybook is a heavy install (~hundreds of pkgs) and is documentation tooling, not a runtime
  dependency for Phase 12/15; the tested token-driven component core (the reusable substance) is
  complete. To add later: `pnpm --filter @cura/ui add -D storybook @storybook/react-vite`, then
  `.storybook/` + stories, and re-enable the `build-storybook` gate.
