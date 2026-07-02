import { sanitizeAttributes } from "./sanitize.js";
import type {
  AttrValue,
  Attributes,
  Counter,
  Histogram,
  Meter,
  ResourceAttributes,
  Span,
  SpanStatus,
  Telemetry,
  Tracer,
} from "./types.js";

/**
 * In-memory telemetry for dev + tests. It records finished spans and metric
 * measurements so tests can assert *what* was emitted and, crucially, that **no
 * PHI leaked** (every attribute has already passed through `sanitizeAttributes`).
 * Deterministic: no clock/network. The real OTLP impl (otel.ts) emits the same
 * shapes to a collector.
 */

export interface RecordedSpan {
  name: string;
  attributes: Attributes;
  status: SpanStatus;
  statusMessage?: string;
  exceptions: string[];
  ended: boolean;
}

export interface RecordedMetric {
  name: string;
  kind: "counter" | "histogram";
  value: number;
  attributes: Attributes;
}

class MemorySpan implements Span {
  status: SpanStatus = "unset";
  statusMessage?: string;
  readonly exceptions: string[] = [];
  ended = false;

  constructor(
    readonly name: string,
    readonly attributes: Attributes,
  ) {}

  setAttribute(key: string, value: AttrValue): void {
    const { attributes } = sanitizeAttributes({ [key]: value });
    Object.assign(this.attributes, attributes);
  }
  setAttributes(attrs: Attributes): void {
    Object.assign(this.attributes, sanitizeAttributes(attrs).attributes);
  }
  recordException(message: string): void {
    this.exceptions.push(message);
  }
  setStatus(status: SpanStatus, message?: string): void {
    this.status = status;
    if (message !== undefined) this.statusMessage = message;
  }
  end(): void {
    this.ended = true;
  }
}

export class InMemoryTelemetry implements Telemetry, Tracer, Meter {
  readonly spans: RecordedSpan[] = [];
  readonly metrics: RecordedMetric[] = [];
  readonly resource: Attributes;

  constructor(resource: ResourceAttributes) {
    this.resource = sanitizeAttributes({
      service: resource.service,
      env: resource.env,
      ...(resource.version ? { version: resource.version } : {}),
    }).attributes;
  }

  get tracer(): Tracer {
    return this;
  }
  get meter(): Meter {
    return this;
  }

  startSpan(name: string, attrs?: Attributes): Span {
    const span = new MemorySpan(name, { ...this.resource, ...sanitizeAttributes(attrs).attributes });
    // Register on end via a proxy: simplest is to push a live reference and read `ended`.
    const record: RecordedSpan = {
      name: span.name,
      attributes: span.attributes,
      status: span.status,
      exceptions: span.exceptions,
      ended: false,
    };
    this.spans.push(record);
    const origEnd = span.end.bind(span);
    span.end = () => {
      origEnd();
      record.status = span.status;
      if (span.statusMessage !== undefined) record.statusMessage = span.statusMessage;
      record.ended = true;
    };
    return span;
  }

  counter(name: string): Counter {
    return {
      add: (value: number, attrs?: Attributes) =>
        this.metrics.push({ name, kind: "counter", value, attributes: sanitizeAttributes(attrs).attributes }),
    };
  }
  histogram(name: string): Histogram {
    return {
      record: (value: number, attrs?: Attributes) =>
        this.metrics.push({ name, kind: "histogram", value, attributes: sanitizeAttributes(attrs).attributes }),
    };
  }

  /** Test helper: finished spans by name. */
  spansNamed(name: string): RecordedSpan[] {
    return this.spans.filter((s) => s.name === name);
  }

  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
