import { describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/app.js";
import { createMemoryPlatform } from "../../apps/api/src/platform/index.js";

/**
 * Phase 16 chaos — graceful shutdown. Closing the gateway must drain cleanly
 * (in-flight requests finish, no throw) and the platform's `shutdown()` must be
 * idempotent so a double SIGTERM cannot crash the drain.
 */
const SECRET = "test-secret-at-least-16-chars-long";

describe("chaos · graceful shutdown", () => {
  it("drains in-flight requests before close resolves", async () => {
    const app = await buildApp(createMemoryPlatform({ sessionSecret: SECRET }));
    // Fire a request and close concurrently; the in-flight request must complete.
    const inflight = app.inject({ method: "GET", url: "/health" });
    const closing = app.close();
    const [res] = await Promise.all([inflight, closing]);
    expect(res.statusCode).toBe(200);
  });

  it("platform.shutdown() is idempotent (double SIGTERM safe)", async () => {
    const platform = createMemoryPlatform({ sessionSecret: SECRET });
    await expect(platform.shutdown()).resolves.toBeUndefined();
    // A second shutdown must not throw.
    await expect(platform.shutdown()).resolves.toBeUndefined();
  });

  it("readiness reports healthy backing stores for the in-memory platform", async () => {
    const platform = createMemoryPlatform({ sessionSecret: SECRET });
    const report = await platform.ready();
    expect(report.ok).toBe(true);
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
    await platform.shutdown();
  });
});
