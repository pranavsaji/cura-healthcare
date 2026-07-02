# Phase 15 — Marketing Site (`apps/marketing`)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 02
- **Unblocks:** — (parallel track)

## Objective
The full cinematic marketing site on Next.js: the home page (hero → flow-line → 3 products → domain-
native → integrations → the Cura Loop → security → CTA), plus per-product pages, security,
integrations, careers, and a `/journal` blog for SEO — all on `@cura/ui` tokens, with buttery scroll
motion, great SEO/OG, and accessibility.

## Context you need
- Demo home exists (`apps/marketing`, Next 15 App Router) with hero, animated FlowLine, product
  sections, marquees, security, CTA. This phase completes the site + polish + tests.
- Design study + page map in `/plan.md` §10.6. No PHI here — this app never touches patient data.
- Read CONVENTIONS §2 (tokens shared), §5 (a11y/e2e).

## Reusability & scalability mandate
- Uses the SAME `@cura/ui` tokens/components as the product — proving one design language.
- Content-driven sections (data arrays) so pages scale without bespoke code.
- Motion is progressive + reduced-motion-safe; nothing blocks first paint.

## Deliverables
```
apps/marketing/app/
  page.tsx                 # home (exists — expand to full section set)
  curanote/page.tsx  curadesk/page.tsx  curabill/page.tsx
  security/page.tsx  integrations/page.tsx  careers/page.tsx
  journal/page.tsx  journal/[slug]/page.tsx   # MDX blog (SEO engine)
  layout.tsx  sitemap.ts  robots.ts  opengraph-image.tsx
components/                # FlowLine (exists), Marquee (exists), SmoothScroll (Lenis), Reveal, Nav
apps/marketing/e2e/        # Playwright: nav, a11y, reduced-motion
```

## Implementation tasks
1. **Complete the home** section set (the Cura Loop 4 cards, live-audit ticker, stat clusters) using
   `@cura/ui`.
2. **Product + supporting pages:** `/curanote|curadesk|curabill`, `/security`, `/integrations`,
   `/careers`.
3. **Journal (SEO):** MDX-driven blog with a content collection; per-post OG images; matches the
   real Curanote content-marketing motion.
4. **Motion:** Lenis smooth scroll + scroll-reveal (`Reveal` using `useInViewReveal` from `@cura/ui`);
   the FlowLine as a scroll-linked "session→note→EHR" story; all reduced-motion safe.
5. **SEO:** metadata, `sitemap.ts`, `robots.ts`, dynamic OG images, JSON-LD; ISR for journal.
6. **Book-a-demo:** Cal.com/Calendly embed on `/` and a `/book-a-demo` route.
7. **A11y + performance:** AA contrast (scrims over imagery), keyboard nav, Lighthouse ≥ 95.

## Validation gate
```bash
pnpm --filter @cura/marketing typecheck
pnpm --filter @cura/marketing build      # Next production build passes
pnpm --filter @cura/marketing e2e        # nav + a11y + reduced-motion
```
- **Acceptance:** production build succeeds; nav routes to every page; axe finds 0 violations on
  home + a product page; `prefers-reduced-motion` disables scroll animations (asserted); Lighthouse
  SEO + a11y ≥ 95 on home; sitemap/robots/OG present.

## Definition of Done
- [ ] Full home + product + security + integrations + careers + journal.
- [ ] Shared `@cura/ui` tokens/components only; no bespoke styling.
- [ ] Motion polished + reduced-motion safe; SEO/OG complete.
- [ ] Build green; e2e + a11y pass.

## Handoff notes
**Delivered (validated 2026-07):**
- **Pages:** `/` (hero → platform/FlowLine → 3 products → Cura Loop → domain-native → integrations →
  security → CTA), `/curanote`, `/curadesk`, `/curabill` (one content-driven `ProductPage`),
  `/security`, `/integrations`, `/careers`, `/journal`, `/journal/[slug]`, `/book-a-demo`.
- **Shared chrome in `layout.tsx`:** `Nav` (real routes + a11y mobile menu), `SiteFooter`,
  `SmoothScroll`, Organization JSON-LD.
- **Content collections:** `lib/site.ts` (nav/products/loop/EHRs/modalities/careers) and
  `lib/journal.ts` (typed post collection). Adding a page/post = editing a data array.
- **Motion:** `Reveal` uses `@cura/ui`'s `useInViewReveal`; `SmoothScroll` toggles native
  `scroll-behavior` **only** when motion is allowed. **Reduced-motion is asserted** in e2e (no
  `data-smooth`, computed `scroll-behavior: auto`, reveals opaque immediately).
- **SEO:** `sitemap.ts`, `robots.ts`, root + per-post `opengraph-image.tsx` (next/og, node runtime,
  system fonts → hermetic build), per-page metadata + canonical, Article JSON-LD, ISR on journal
  (`revalidate = 3600`, `generateStaticParams`).
- **Demo booking:** `DemoBooking` embeds `NEXT_PUBLIC_CALCOM_LINK` (Cal.com/Calendly) if set, else
  degrades to an email CTA. Config over hardcoding.

**Choices / deviations:**
- **No MDX toolchain.** Journal is a typed block collection (`Block[]`) rendered by the slug page —
  keeps `next build` hermetic and fast. Swapping to MDX later is drop-in behind `getAllPosts`/`getPost`.
- **No Lenis / JS scroll-hijack.** Native CSS smooth scroll is buttery, a11y-safe, and zero-dep.
- **Webpack `extensionAlias`** added to `next.config.mjs` so the `@cura/ui`/`@cura/shared` `.js`
  (NodeNext-style) barrels resolve to TS source without a build step.
- **Contrast fixes** (AA): Marquee pills now opaque `bg-bg-800`/`text-text-hi`; footer + small labels
  moved off `text-text-lo` (which fails AA at small sizes) to `text-text-mid`. No shared tokens changed.

**Validation:** `pnpm --filter @cura/marketing typecheck` ✓ · `build` ✓ (21 routes prerendered) ·
`e2e` ✓ (15 tests: 9 routes + link-nav + sitemap/robots + **axe 0 violations** on `/` and `/curanote`
+ reduced-motion both directions). e2e boots `next dev` on port 4713 (override `MARKETING_PORT`).
Lighthouse not run in this environment (no headless Lighthouse harness); a11y is covered by axe e2e.
New script: `pnpm --filter @cura/marketing e2e`.
