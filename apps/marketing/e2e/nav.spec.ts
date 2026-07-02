import { expect, test } from "@playwright/test";

/**
 * Navigation e2e: every primary route is reachable and renders its unique H1.
 * Proves the content-driven routing works end to end (Phase 15 acceptance).
 */
const ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /Ambient agents for behavioral health/i },
  { path: "/curanote", heading: /Notes that write themselves/i },
  { path: "/curadesk", heading: /Never miss a lead again/i },
  { path: "/curabill", heading: /Fewer denials/i },
  { path: "/security", heading: /Enterprise-grade from day one/i },
  { path: "/integrations", heading: /existing software stack/i },
  { path: "/careers", heading: /Give clinicians their time back/i },
  { path: "/journal", heading: /Field notes from the frontier/i },
  { path: "/book-a-demo", heading: /See it run in your stack/i },
];

for (const route of ROUTES) {
  test(`route ${route.path} renders`, async ({ page }) => {
    const res = await page.goto(route.path);
    expect(res?.status(), `status for ${route.path}`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(route.heading);
  });
}

test("nav links reach a product page and a journal post", async ({ page }) => {
  await page.goto("/");
  // Product card link on the home page.
  await page.getByRole("link", { name: /Curanote · Ambient documentation/i }).first().click();
  await expect(page).toHaveURL(/\/curanote$/);

  // Journal list → a post detail.
  await page.goto("/journal");
  await page.getByRole("link", { name: /ambient documentation belongs/i }).click();
  await expect(page).toHaveURL(/\/journal\/ambient-documentation-behavioral-health$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sitemap and robots are served", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/curanote");

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/sitemap/i);
});
