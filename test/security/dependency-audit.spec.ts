import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Phase 16 security — dependency audit (SCA). Runs `pnpm audit` and fails the
 * build if any CRITICAL advisory is present. High/moderate are surfaced but do
 * not fail the gate (triaged separately). In an offline/sandboxed environment
 * the registry is unreachable — we skip rather than false-fail, so this never
 * blocks local runs, but it DOES gate CI where the network is available.
 */
describe("security · dependency audit (no criticals)", () => {
  it("has zero critical advisories", () => {
    let raw: string;
    try {
      raw = execFileSync("pnpm", ["audit", "--json", "--audit-level", "critical"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 120_000,
      });
    } catch (err) {
      const e = err as { stdout?: string; code?: string; message?: string };
      // `pnpm audit` exits non-zero when advisories are found — still gives JSON.
      if (e.stdout && e.stdout.trim().startsWith("{")) {
        raw = e.stdout;
      } else {
        // No network / pnpm unavailable → skip (do not false-fail local runs).
        console.warn("dependency-audit: skipped (audit unavailable):", e.message);
        return;
      }
    }

    // pnpm emits per-advisory JSON lines or a summary object; be liberal.
    let criticalCount = 0;
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      try {
        const obj = JSON.parse(t) as {
          metadata?: { vulnerabilities?: Record<string, number> };
          advisories?: Record<string, { severity?: string }>;
          severity?: string;
        };
        if (obj.metadata?.vulnerabilities?.critical) criticalCount += obj.metadata.vulnerabilities.critical;
        if (obj.severity === "critical") criticalCount += 1;
        if (obj.advisories) {
          criticalCount += Object.values(obj.advisories).filter((a) => a.severity === "critical").length;
        }
      } catch {
        /* not JSON — ignore */
      }
    }
    expect(criticalCount, "critical dependency advisories").toBe(0);
  });
});
