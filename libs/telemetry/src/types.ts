/**
 * Vendor-neutral telemetry surface. Like every other external capability in the
 * platform (ASR/LLM/EHR), observability sits behind an interface with a `mock`
 * (in-memory) impl and a real (OTLP) impl selected by env — no app imports the
 * OTel SDK directly (CONVENTIONS §2). Attribute values are constrained to
 * primitives and pass through a PHI filter, so a span/metric can NEVER carry PHI
 * (CONVENTIONS §6 — the healthcare-grade guarantee).
 */

export type AttrValue = string | number | boolean;
export type Attributes = Record<string, AttrValue>;

export type SpanStatus = "unset" | "ok" | "error";

export interface Span {
  setAttribute(key: string, value: AttrValue): void;
  setAttributes(attrs: Attributes): void;
  /** Record an error by *message only* (never attach PHI-bearing payloads). */
  recordException(message: string): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, attrs?: Attributes): Span;
}

export interface Counter {
  add(value: number, attrs?: Attributes): void;
}

export interface Histogram {
  record(value: number, attrs?: Attributes): void;
}

export interface Meter {
  counter(name: string): Counter;
  histogram(name: string): Histogram;
}

export interface Telemetry {
  readonly tracer: Tracer;
  readonly meter: Meter;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Resource attributes stamped on every span/metric (service identity, no PHI). */
export interface ResourceAttributes {
  service: string;
  env: string;
  version?: string;
}

export type TelemetryExporter = "none" | "memory" | "otlp";

export interface TelemetryConfig {
  exporter: TelemetryExporter;
  resource: ResourceAttributes;
  /** OTLP endpoint (only used when exporter="otlp"). */
  otlpEndpoint?: string;
}
