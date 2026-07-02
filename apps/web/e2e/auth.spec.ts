import { expect, test } from "@playwright/test";

/**
 * Auth + accessibility (Phase 12 acceptance). With the dev auth provider the app
 * authenticates from the session; we assert the authenticated shell renders and
 * the login screen is reachable, and that primary nav is keyboard-accessible.
 */
test("authenticated shell renders with primary navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: /Primary/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: /Dashboard/i })).toBeVisible();
});

test("login screen is reachable and offers role sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Continue as clinician/i })).toBeVisible();
});

test("primary nav is keyboard-focusable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: /Primary/i })).toBeVisible({ timeout: 20_000 });
  // Tab into the document and assert an interactive element receives focus.
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => document.activeElement?.tagName ?? "");
  expect(["A", "BUTTON", "INPUT", "SELECT"]).toContain(active);
});
