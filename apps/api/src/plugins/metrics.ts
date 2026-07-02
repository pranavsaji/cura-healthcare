import fp from "fastify-plugin";
import { type Telemetry, createTelemetry, recordHttpRequest } from "@cura/telemetry";
import { env } from "../env.js";

/**
 * Request metrics + tracing. Emits OpenTelemetry spans + RED metrics per request
 * via `@cura/telemetry` (PHI-free: route TEMPLATE + status + duration only, never
 * the path/body), and keeps the Prometheus-compatible `/metrics` text endpoint.
 * The telemetry impl is selected by env (`OTEL_EXPORTER`; default noop = zero
 * overhead); tests inject an in-memory telemetry to assert spans.
 */
export interface MetricsPluginOptions {
  telemetry?: Telemetry;
}

export const metricsPlugin = fp<MetricsPluginOptions>(
  async function metrics(app, opts) {
    const telemetry =
      opts.telemetry ??
      createTelemetry({
        exporter: env.otelExporter,
        resource: { service: "api", env: env.nodeEnv },
      });
    app.decorate("telemetry", telemetry);

    const counts = new Map<string, number>();
    const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

    app.addHook("onResponse", async (req, reply) => {
      const statusClass = `${Math.floor(reply.statusCode / 100)}xx`;
      bump(`http_requests_total{method="${req.method}",status="${statusClass}"}`);
      // Route TEMPLATE (e.g. /notes/:id), never the concrete path — bounds
      // cardinality and prevents an id-in-path leaking as PHI.
      const route = req.routeOptions?.url ?? req.url.split("?")[0] ?? "unknown";
      recordHttpRequest(telemetry, {
        method: req.method,
        route,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        requestId: String(req.id),
      });
    });

    app.get("/metrics", { config: { public: true }, schema: { hide: true } }, async (_req, reply) => {
      const lines = ["# TYPE http_requests_total counter"];
      for (const [key, value] of counts) lines.push(`${key} ${value}`);
      return reply.type("text/plain").send(lines.join("\n") + "\n");
    });
  },
  { name: "metrics" },
);
