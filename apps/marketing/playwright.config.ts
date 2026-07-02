import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the marketing site e2e (Phase 15): navigation, axe a11y,
 * and reduced-motion. Boots the Next dev server on an uncommon port. No API, no
 * PHI — this app is fully static/content-driven.
 */
const PORT = process.env.MARKETING_PORT ?? "4713";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
