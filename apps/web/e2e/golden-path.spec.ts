import { expect, test } from "@playwright/test";

/**
 * Golden path (Phase 12 acceptance), headless against the API with mock
 * providers: start session → consent → play demo → watch the transcript stream →
 * the note writes itself → edit a section → sign → Super Fill (clipboard). Uses
 * the keyless demo path so no mic/API keys are needed.
 */
test("consent → record(demo) → note → edit → sign → super fill", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/record");

  // Consent gate: Start is disabled until consent is checked.
  const start = page.getByRole("button", { name: /Start session/i });
  await expect(start).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(start).toBeEnabled();
  await start.click();

  // Live transcript streams from the demo playback.
  await page.getByRole("button", { name: /Play demo session/i }).click();
  await expect(page.getByText(/anxious/i).first()).toBeVisible({ timeout: 20_000 });

  // End the session → the note streams in.
  await page.getByRole("button", { name: /End session & write note/i }).click();
  const firstSection = page.locator("textarea").first();
  await expect(firstSection).toBeVisible({ timeout: 20_000 });

  // Edit a section and save.
  await firstSection.fill("Edited by clinician during review.");
  await page.getByRole("button", { name: /Save edit/i }).first().click();

  // Sign, then Super Fill (copies formatted note to the clipboard).
  await page.getByRole("button", { name: /Sign note/i }).click();
  await page.getByRole("button", { name: /Super Fill/i }).click();
  await expect(page.getByRole("button", { name: /Copied for EHR/i })).toBeVisible({ timeout: 10_000 });
});
