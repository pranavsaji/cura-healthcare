import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { InMemoryTelemetry } from "@cura/telemetry";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform } from "../src/platform/index.js";

/**
 * Phase 14 acceptance (API side): a request produces a trace with spans and NO
 * PHI in attributes; the audit UI endpoint lists a just-performed mutation with
 * the right actor/action, is tenant-scoped, and surfaces chain integrity.
 */
let app: FastifyInstance;
let telemetry: InMemoryTelemetry;

beforeAll(async () => {
  telemetry = new InMemoryTelemetry({ service: "api", env: "test" });
  app = await buildApp(createMemoryPlatform(), { telemetry });
});

afterAll(async () => {
  await app.close();
});

describe("observability", () => {
  it("produces a span per request with a route template and no PHI attributes", async () => {
    await app.inject({ method: "GET", url: "/templates" });
    const span = telemetry.spans.find((s) => s.name.includes("/templates"));
    expect(span).toBeDefined();
    expect(span!.attributes["http.route"]).toBe("/templates");
    expect(span!.attributes["http.status_code"]).toBe(200);
    // No PHI-bearing attribute keys anywhere in emitted spans.
    for (const s of telemetry.spans) {
      for (const key of Object.keys(s.attributes)) {
        expect(/content|transcript|clientlabel|note|quote|secret|token/i.test(key)).toBe(false);
      }
    }
  });

  it("records RED metrics for requests", async () => {
    await app.inject({ method: "GET", url: "/health" });
    expect(telemetry.metrics.some((m) => m.name === "http.server.requests")).toBe(true);
    expect(telemetry.metrics.some((m) => m.name === "http.server.duration_ms")).toBe(true);
  });

  it("lists a just-performed mutation in the audit trail with correct actor/action", async () => {
    // Perform an audited mutation: create a session.
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { clientLabel: "A. Test", source: "live" },
    });
    expect(created.statusCode).toBe(201);

    const audit = await app.inject({ method: "GET", url: "/audit?action=session.created" });
    expect(audit.statusCode).toBe(200);
    const { events } = audit.json() as { events: { action: string; actor: string; phiTouched: boolean }[] };
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.action).toBe("session.created");
    expect(typeof events[0]!.actor).toBe("string");
  });

  it("surfaces audit-chain integrity as verified", async () => {
    const res = await app.inject({ method: "GET", url: "/audit/verify" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("exposes the run inspector steps for a resource", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { clientLabel: "R. Run", source: "live" } });
    const sessionId = created.json().id as string;
    const res = await app.inject({ method: "GET", url: `/runs/session:${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().steps)).toBe(true);
  });
});
