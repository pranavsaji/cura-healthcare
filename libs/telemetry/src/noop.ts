import type { Counter, Histogram, Meter, Span, Telemetry, Tracer } from "./types.js";

/**
 * Zero-overhead telemetry: the default when observability is disabled (dev/CI,
 * or before an OTLP collector is configured). Every operation is a no-op, so
 * instrumentation code can be written unconditionally without runtime cost.
 */

const noopSpan: Span = {
  setAttribute() {},
  setAttributes() {},
  recordException() {},
  setStatus() {},
  end() {},
};

const noopTracer: Tracer = { startSpan: () => noopSpan };

const noopCounter: Counter = { add() {} };
const noopHistogram: Histogram = { record() {} };
const noopMeter: Meter = { counter: () => noopCounter, histogram: () => noopHistogram };

export class NoopTelemetry implements Telemetry {
  readonly tracer = noopTracer;
  readonly meter = noopMeter;
  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
