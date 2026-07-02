import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createLogger } from "@cura/core";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform, type Platform } from "../src/platform/index.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../src/platform/directory.js";

/**
 * Phase 16 — the PHI-in-logs scan. Drives a real PHI-touching flow (create a
 * session with an obvious client label, upload audio, generate a note) through
 * the gateway with a **capturing logger**, then asserts NO PHI marker ever
 * appears in any emitted log line. Also asserts the logger redacts known PHI +
 * secret fields at the source. Acceptance: zero hits.
 */
const SECRET = "test-secret-at-least-16-chars-long";
const PHI_MARKER = "Jane-Q-Doe-SENSITIVE-MRN-8675309";

/** A pino destination that buffers every emitted line for scanning. */
function capturingLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    name: "api",
    level: "trace",
    destination: { write: (msg: string) => void lines.push(msg) },
  });
  return { logger, lines };
}

describe("Phase 16 · PHI-free logs", () => {
  it("redacts PHI + secret fields at the logger boundary", () => {
    const { logger, lines } = capturingLogger();
    logger.info(
      {
        orgId: "org-1",
        mrn: PHI_MARKER,
        clientLabel: PHI_MARKER,
        content: PHI_MARKER,
        transcript: PHI_MARKER,
        token: "super-secret-token",
        req: { headers: { authorization: "Bearer super-secret-token" } },
        client: { mrn: PHI_MARKER },
      },
      "note.generated",
    );
    const out = lines.join("\n");
    expect(out).not.toContain(PHI_MARKER);
    expect(out).not.toContain("super-secret-token");
    expect(out).toContain("[redacted]");
    // Non-PHI correlation fields are still logged.
    expect(out).toContain("org-1");
  });

  describe("end-to-end request flow", () => {
    let app: FastifyInstance;
    let lines: string[];
    let platform: Platform;

    beforeAll(async () => {
      const cap = capturingLogger();
      lines = cap.lines;
      platform = createMemoryPlatform({ sessionSecret: SECRET, logger: cap.logger });
      app = await buildApp(platform);
    });
    afterAll(async () => await app.close());

    it("no PHI marker appears in any log line across a full note flow", async () => {
      const auth = {
        authorization: `Bearer ${platform.auth.issueSession({
          userId: DEV_USER_IDS.clinician,
          orgId: DEV_ORG_ID,
          role: "clinician",
        })}`,
      };

      const created = await app.inject({
        method: "POST",
        url: "/sessions",
        headers: auth,
        payload: { clientLabel: PHI_MARKER },
      });
      expect(created.statusCode).toBe(201);
      const sessionId = created.json().id as string;

      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/consent`,
        headers: auth,
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/audio`,
        headers: auth,
        payload: { audio: Buffer.from(PHI_MARKER).toString("base64") },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/generate`,
        headers: auth,
      });

      // We logged *something* (correlation lines), and none of it is PHI.
      expect(lines.length).toBeGreaterThan(0);
      const hits = lines.filter((l) => l.includes(PHI_MARKER));
      expect(hits, `PHI leaked in ${hits.length} log line(s)`).toEqual([]);
    });
  });
});
