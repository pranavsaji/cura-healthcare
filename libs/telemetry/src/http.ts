import { sanitizeAttributes } from "./sanitize.js";
import type { Attributes, Span, Telemetry } from "./types.js";

/**
 * HTTP instrumentation: a per-request span + the RED metrics (Rate, Errors,
 * Duration) every service exposes uniformly. Attributes are ids/route/status/
 * duration only — never the body (PHI). `route` must be the *template*
 * (`/notes/:id`), never the concrete path, so cardinality stays bounded and no
 * id-in-path leaks as PHI.
 */

export interface HttpRequestMetric {
  method: string;
  /** Route template, e.g. `/notes/:id` — NOT the concrete path. */
  route: string;
  statusCode: number;
  durationMs: number;
  /** Correlation id from `@cura/core` request context (an id, PHI-safe). */
  requestId?: string;
  traceId?: string;
}

const REQUESTS = "http.server.requests";
const DURATION = "http.server.duration_ms";
const ERRORS = "http.server.errors";

/** Record a completed HTTP request as a span + RED metrics. */
export function recordHttpRequest(t: Telemetry, m: HttpRequestMetric): void {
  const labels: Attributes = {
    "http.method": m.method,
    "http.route": m.route,
    "http.status_code": m.statusCode,
  };
  const span = t.tracer.startSpan(`HTTP ${m.method} ${m.route}`, {
    ...labels,
    "http.duration_ms": m.durationMs,
    ...(m.requestId ? { "request.id": m.requestId } : {}),
    ...(m.traceId ? { "trace.id": m.traceId } : {}),
  });
  const errored = m.statusCode >= 500;
  span.setStatus(errored ? "error" : "ok");
  span.end();

  t.meter.counter(REQUESTS).add(1, labels);
  t.meter.histogram(DURATION).record(m.durationMs, labels);
  if (errored) t.meter.counter(ERRORS).add(1, labels);
}

/**
 * Wrap an async operation in a span (worker workflows, LLM calls, etc.).
 * Attributes are sanitized; a thrown error is recorded by message only and the
 * span is marked error, then re-thrown.
 */
export async function withSpan<T>(
  t: Telemetry,
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = t.tracer.startSpan(name, sanitizeAttributes(attrs).attributes);
  try {
    const result = await fn(span);
    span.setStatus("ok");
    return result;
  } catch (err) {
    span.recordException(err instanceof Error ? err.message : String(err));
    span.setStatus("error");
    throw err;
  } finally {
    span.end();
  }
}
