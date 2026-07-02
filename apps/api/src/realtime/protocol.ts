import { ClientMessage, ServerMessage } from "@cura/shared";

/**
 * Strict (de)serialization for the WS protocol. Every inbound frame is parsed
 * against the `@cura/shared` schemas (CONVENTIONS §3 — validate at the boundary);
 * malformed frames are rejected, never coerced. Outbound frames are validated on
 * the way in to the pub/sub layer so a bad producer can't publish garbage.
 */

/** Parse a raw inbound frame into a typed {@link ClientMessage}, or throw. */
export function parseClientMessage(raw: string | Buffer): ClientMessage {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
  return ClientMessage.parse(json);
}

/** Serialize a validated {@link ServerMessage} for transport. */
export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(ServerMessage.parse(msg));
}

/** Parse a server frame off the wire (pub/sub); returns null if invalid. */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    return ServerMessage.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Server messages that are safe to drop under backpressure (interim only). */
export function isDroppableUnderBackpressure(msg: ServerMessage): boolean {
  return msg.type === "partial";
}
