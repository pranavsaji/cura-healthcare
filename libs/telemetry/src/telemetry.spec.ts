import { describe, expect, it } from "vitest";
import { InMemoryTelemetry } from "./memory.js";
import { NoopTelemetry } from "./noop.js";
import { recordHttpRequest, withSpan } from "./http.js";
import { recordWsConnection, recordWsMessage } from "./ws.js";
import { createTelemetry, exporterFromEnv, initTelemetry, telemetryConfigFromEnv } from "./otel.js";

const resource = { service: "api", env: "test" };

describe("InMemoryTelemetry", () => {
  it("records finished spans with resource attributes and PHI stripped", () => {
    const t = new InMemoryTelemetry(resource);
    const span = t.tracer.startSpan("op", { "http.route": "/x", transcript: "PHI!" as unknown as string });
    span.setAttribute("http.status_code", 200);
    span.end();
    const [rec] = t.spansNamed("op");
    expect(rec?.ended).toBe(true);
    expect(rec?.attributes).toMatchObject({ service: "api", env: "test", "http.route": "/x", "http.status_code": 200 });
    expect(rec?.attributes).not.toHaveProperty("transcript");
  });

  it("records counter and histogram measurements", () => {
    const t = new InMemoryTelemetry(resource);
    t.meter.counter("c").add(2, { k: "v" });
    t.meter.histogram("h").record(15, { k: "v" });
    expect(t.metrics).toContainEqual({ name: "c", kind: "counter", value: 2, attributes: { k: "v" } });
    expect(t.metrics).toContainEqual({ name: "h", kind: "histogram", value: 15, attributes: { k: "v" } });
  });
});

describe("http instrumentation", () => {
  it("emits a span + RED metrics for a request, with no PHI", () => {
    const t = new InMemoryTelemetry(resource);
    recordHttpRequest(t, { method: "GET", route: "/notes/:id", statusCode: 200, durationMs: 12, requestId: "req-1" });
    const [span] = t.spansNamed("HTTP GET /notes/:id");
    expect(span?.status).toBe("ok");
    expect(span?.attributes).toMatchObject({ "http.method": "GET", "http.route": "/notes/:id", "request.id": "req-1" });
    expect(t.metrics.find((m) => m.name === "http.server.requests")?.value).toBe(1);
    expect(t.metrics.find((m) => m.name === "http.server.duration_ms")?.value).toBe(12);
  });

  it("counts 5xx as an error on the span and the error metric", () => {
    const t = new InMemoryTelemetry(resource);
    recordHttpRequest(t, { method: "POST", route: "/sessions", statusCode: 500, durationMs: 4 });
    expect(t.spansNamed("HTTP POST /sessions")[0]?.status).toBe("error");
    expect(t.metrics.some((m) => m.name === "http.server.errors")).toBe(true);
  });

  it("withSpan marks error + records the message (not payload) on throw", async () => {
    const t = new InMemoryTelemetry(resource);
    await expect(
      withSpan(t, "risky", { "job.id": "j1" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const [span] = t.spansNamed("risky");
    expect(span?.status).toBe("error");
    expect(span?.exceptions).toContain("boom");
  });
});

describe("ws instrumentation", () => {
  it("records connection lifecycle and message counts by type/direction (no payload)", () => {
    const t = new InMemoryTelemetry(resource);
    recordWsConnection(t, { event: "open", connectionId: "c1", orgId: "org-1" });
    recordWsMessage(t, { type: "note.section", direction: "out" });
    expect(t.spansNamed("WS open")).toHaveLength(1);
    expect(t.metrics.find((m) => m.name === "ws.messages")?.attributes).toMatchObject({ "ws.type": "note.section" });
  });
});

describe("factory", () => {
  it("selects the impl by exporter", () => {
    expect(createTelemetry({ exporter: "none", resource })).toBeInstanceOf(NoopTelemetry);
    expect(createTelemetry({ exporter: "memory", resource })).toBeInstanceOf(InMemoryTelemetry);
  });

  it("degrades otlp to noop when the SDK is absent (never crashes the service)", async () => {
    const warnings: string[] = [];
    const t = await initTelemetry({ exporter: "otlp", resource }, (m) => warnings.push(m));
    expect(t).toBeInstanceOf(NoopTelemetry);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("parses exporter + resource from env", () => {
    expect(exporterFromEnv("otlp")).toBe("otlp");
    expect(exporterFromEnv("bogus")).toBe("none");
    const cfg = telemetryConfigFromEnv({ exporter: "memory", service: "worker", env: "prod", version: "1.0" });
    expect(cfg).toMatchObject({ exporter: "memory", resource: { service: "worker", env: "prod", version: "1.0" } });
  });
});
