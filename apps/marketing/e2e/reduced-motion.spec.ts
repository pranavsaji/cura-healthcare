import { expect, test } from "@playwright/test";

/**
 * Reduced-motion e2e: with `prefers-reduced-motion: reduce`, the SmoothScroll
 * enhancement must NOT enable smooth scrolling, and reveal elements must be fully
 * visible immediately (no opacity/blur animation). Asserts the a11y motion mandate.
 *
 * We emulate the media feature explicitly via `page.emulateMedia` (the reliable
 * per-page API) rather than the context fixture.
 */
test("reduced motion: smooth scroll disabled + reveals shown immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  // SmoothScroll never marks the root as smooth under reduced motion.
  await expect(page.locator("html")).not.toHaveAttribute("data-smooth", "true");

  // CSS media query guarantees `scroll-behavior: auto` regardless of hydration.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))
    .toBe("auto");

  // Reveal blocks are opaque (revealed) without needing to scroll.
  const reveal = page.locator(".reveal").first();
  await expect(reveal).toBeVisible();
  const opacity = await reveal.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeGreaterThan(0.99);
});

test("motion allowed: smooth scroll enabled after hydration", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-smooth", "true");
});
