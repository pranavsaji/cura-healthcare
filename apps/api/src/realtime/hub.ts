import type { ServerMessage } from "@cura/shared";
import type { PubSub, Subscription } from "./pubsub.js";
import { parseServerMessage, serializeServerMessage } from "./protocol.js";

/**
 * The single reusable realtime hub for every vertical (scribe transcript,
 * Curadesk voice, Curabill status) — differentiated by channel, not by new
 * transport code. It owns channel naming and (de)serialization over a swappable
 * {@link PubSub}; it holds **no** socket registry, so any replica can publish to
 * or subscribe from any session.
 *
 * Channel scheme: `rt:{orgId}:{sessionId}` — org-scoped so a subscription can
 * never cross tenants even if a session id collided.
 */
export class RealtimeHub {
  constructor(private readonly pubsub: PubSub) {}

  channel(orgId: string, sessionId: string): string {
    return `rt:${orgId}:${sessionId}`;
  }

  /** Deliver `msg` to every subscriber of this session on any replica. */
  async publish(orgId: string, sessionId: string, msg: ServerMessage): Promise<void> {
    await this.pubsub.publish(this.channel(orgId, sessionId), serializeServerMessage(msg));
  }

  /** Subscribe to a session's stream; `onMessage` fires for each valid frame. */
  async subscribe(
    orgId: string,
    sessionId: string,
    onMessage: (msg: ServerMessage) => void,
  ): Promise<Subscription> {
    return this.pubsub.subscribe(this.channel(orgId, sessionId), (raw) => {
      const parsed = parseServerMessage(raw);
      if (parsed) onMessage(parsed);
    });
  }

  async close(): Promise<void> {
    await this.pubsub.close();
  }
}
