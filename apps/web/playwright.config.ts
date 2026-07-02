import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the golden-path + auth e2e (Phase 12). Boots the API
 * (mock providers, in-memory platform — no Docker, no keys) and the Vite dev
 * server, then drives the full flow headless. `reuseExistingServer` keeps local
 * runs fast; CI starts fresh.
 */
// Uncommon ports to avoid colliding with other local dev servers.
const API_PORT = process.env.API_PORT ?? "4711";
const WEB_PORT = process.env.WEB_PORT ?? "4712";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @cura/api dev",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      // Empty DATABASE_URL forces the in-memory platform (no Docker/Postgres).
      // A value set in the environment takes precedence over the repo `.env`.
      env: {
        ASR_PROVIDER: "mock",
        LLM_PROVIDER: "mock",
        API_PORT,
        DATABASE_URL: "",
        // CORS must allow the e2e web origin for credentialed /auth requests.
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
