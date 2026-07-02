import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../apps/api/src/app.js";
import { createMemoryPlatform, type Platform } from "../../apps/api/src/platform/index.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../../apps/api/src/platform/directory.js";

/**
 * Phase 16 load — NFR gate (in-process). Drives the real handler → domain → store
 * path under concurrency and asserts the platform's latency/throughput NFRs:
 *   • partial/transcript step  < 1500 ms
 *   • note draft               < 60000 ms
 *   • N concurrent sessions succeed
 *
 * This runs against the mock providers (no network), so it measures OUR overhead,
 * not a vendor's — a regression in the hot path (extra copies, N+1s) trips it.
 * `test/load/*.js` are k6 scripts for load against a real deployed environment.
 */
const SECRET = "test-secret-at-least-16-chars-long";
const PARTIAL_NFR_MS = 1500;
const NOTE_NFR_MS = 60_000;
const CONCURRENCY = 25;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

describe("load · NFR thresholds (in-process)", () => {
  let app: FastifyInstance;
  let platform: Platform;
  let auth: { authorization: string };

  beforeAll(async () => {
    platform = createMemoryPlatform({ sessionSecret: SECRET, rateLimitPerMin: 1_000_000 });
    app = await buildApp(platform);
    auth = {
      authorization: `Bearer ${platform.auth.issueSession({
        userId: DEV_USER_IDS.clinician,
        orgId: DEV_ORG_ID,
        role: "clinician",
      })}`,
    };
  });
  afterAll(async () => await app.close());

  async function runOneSession(): Promise<{ partialMs: number; noteMs: number }> {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: auth, payload: { clientLabel: "Load" } });
    const id = created.json().id as string;
    await app.inject({ method: "POST", url: `/sessions/${id}/consent`, headers: auth });

    const t0 = performance.now();
    await app.inject({ method: "POST", url: `/sessions/${id}/audio`, headers: auth, payload: { audio: "AAAA" } });
    const partialMs = performance.now() - t0;

    const t1 = performance.now();
    const gen = await app.inject({ method: "POST", url: `/sessions/${id}/generate`, headers: auth });
    const noteMs = performance.now() - t1;
    expect(gen.statusCode).toBe(201);
    return { partialMs, noteMs };
  }

  it(`sustains ${CONCURRENCY} concurrent sessions within NFRs`, async () => {
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => runOneSession()));
    expect(results.length).toBe(CONCURRENCY);

    const partialP95 = percentile(results.map((r) => r.partialMs), 95);
    const noteP95 = percentile(results.map((r) => r.noteMs), 95);

    // Surface the measured numbers for the handoff notes.
    console.log(
      `[NFR] partials p95=${partialP95.toFixed(1)}ms (< ${PARTIAL_NFR_MS}) · note p95=${noteP95.toFixed(1)}ms (< ${NOTE_NFR_MS})`,
    );
    expect(partialP95).toBeLessThan(PARTIAL_NFR_MS);
    expect(noteP95).toBeLessThan(NOTE_NFR_MS);
  });
});
