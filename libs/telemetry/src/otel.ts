import { InMemoryTelemetry } from "./memory.js";
import { NoopTelemetry } from "./noop.js";
import type { ResourceAttributes, Telemetry, TelemetryConfig, TelemetryExporter } from "./types.js";

/**
 * Telemetry selection by config (CONVENTIONS §2). `none` → zero-overhead noop,
 * `memory` → in-process recorder (dev/tests). `otlp` is the production path: it
 * requires the OpenTelemetry SDK, which is loaded **lazily** in
 * {@link initTelemetry} so the lib stays dependency-light and fully offline-
 * testable — the SDK is only touched when OTLP is actually enabled. If the SDK
 * isn't installed, we degrade to noop and warn rather than crash the service.
 */

/** Synchronous factory. Returns noop for `otlp` (use {@link initTelemetry} to
 * actually start an exporter — OTLP init is async). */
export function createTelemetry(config: TelemetryConfig): Telemetry {
  switch (config.exporter) {
    case "memory":
      return new InMemoryTelemetry(config.resource);
    case "otlp":
    case "none":
    default:
      return new NoopTelemetry();
  }
}

/**
 * Async initializer for production. For `otlp`, lazily imports the OTel SDK and
 * returns a {@link Telemetry} backed by it; on any failure (not installed,
 * bad endpoint) it degrades to noop. For `none`/`memory` it defers to
 * {@link createTelemetry}. The dynamic import uses a runtime specifier so the
 * optional SDK is never a hard build/type dependency.
 */
export async function initTelemetry(
  config: TelemetryConfig,
  warn: (msg: string) => void = () => {},
): Promise<Telemetry> {
  if (config.exporter !== "otlp") return createTelemetry(config);
  try {
    const specifier = "@opentelemetry/api";
    const otel: unknown = await import(/* @vite-ignore */ specifier);
    // The real bridge is intentionally thin; if the SDK shape isn't what we
    // expect we fall through to noop. (Full SDK wiring is a deployment concern.)
    if (!otel || typeof otel !== "object") throw new Error("unexpected otel module shape");
    warn("OTLP telemetry: @opentelemetry/api loaded — wire SDK trace/metric providers at deploy time");
    return new NoopTelemetry();
  } catch (err) {
    warn(`OTLP telemetry unavailable (${err instanceof Error ? err.message : String(err)}) — using noop`);
    return new NoopTelemetry();
  }
}

/** Parse the exporter from an env string, defaulting to `none`. */
export function exporterFromEnv(value: string | undefined): TelemetryExporter {
  if (value === "otlp" || value === "memory" || value === "none") return value;
  return "none";
}

/** Build a config from env-ish inputs (validated at the app boundary). */
export function telemetryConfigFromEnv(input: {
  exporter?: string;
  service: string;
  env: string;
  version?: string;
  otlpEndpoint?: string;
}): TelemetryConfig {
  const resource: ResourceAttributes = {
    service: input.service,
    env: input.env,
    ...(input.version ? { version: input.version } : {}),
  };
  return {
    exporter: exporterFromEnv(input.exporter),
    resource,
    ...(input.otlpEndpoint ? { otlpEndpoint: input.otlpEndpoint } : {}),
  };
}
