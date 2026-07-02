import type { Attributes, Telemetry } from "./types.js";

/**
 * Realtime (WebSocket) instrumentation: connection lifecycle + message counts.
 * Only ids, direction, and message *type* (an enum) are recorded — never the
 * message payload (transcripts/notes are PHI). Powers the realtime dashboards
 * (connections, msg rate) without exposing content.
 */

export interface WsConnectionEvent {
  event: "open" | "close";
  connectionId: string;
  orgId?: string;
}

export interface WsMessageEvent {
  /** Protocol message type enum, e.g. `note.section` — NOT the payload. */
  type: string;
  direction: "in" | "out";
}

const CONNECTIONS = "ws.connections";
const MESSAGES = "ws.messages";

export function recordWsConnection(t: Telemetry, e: WsConnectionEvent): void {
  const labels: Attributes = { "ws.event": e.event, "connection.id": e.connectionId, ...(e.orgId ? { "org.id": e.orgId } : {}) };
  const span = t.tracer.startSpan(`WS ${e.event}`, labels);
  span.setStatus("ok");
  span.end();
  t.meter.counter(CONNECTIONS).add(e.event === "open" ? 1 : -1, { "ws.event": e.event });
}

export function recordWsMessage(t: Telemetry, e: WsMessageEvent): void {
  t.meter.counter(MESSAGES).add(1, { "ws.type": e.type, "ws.direction": e.direction });
}
