import type { TenantContext } from "@cura/shared";
import type { Logger } from "@cura/core";
import type { ServerMessage } from "@cura/shared";
import type { AsrStream } from "../providers/asr.js";
import type { RealtimeHub } from "./hub.js";
import type { Subscription } from "./pubsub.js";
import { isDroppableUnderBackpressure, serializeServerMessage } from "./protocol.js";

/** Minimal socket surface (satisfied by the `ws` WebSocket). */
export interface SocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  terminate(): void;
}

/** WebSocket.OPEN. */
const OPEN = 1;

export interface ConnectionDeps {
  hub: RealtimeHub;
  logger: Logger;
  /** Outbound buffer above which interim (partial) frames are dropped. */
  maxBufferedBytes?: number;
  /** Heartbeat ping interval (ms). */
  heartbeatMs?: number;
  /** Close the socket if no frame is received within this window (ms). */
  idleTimeoutMs?: number;
}

/**
 * Per-socket lifecycle: subscribes the socket to its session channel, applies
 * backpressure (drop interim partials, always keep finals), runs a ping/pong
 * heartbeat with an idle timeout, and cleans up on close. Holds the per-session
 * ASR stream so handlers can drive it. No business logic lives here.
 */
export class Connection {
  readonly ctx: TenantContext;
  /** The session this socket is bound to (null until `start`). */
  sessionId: string | null = null;
  /** Live ASR stream for the current session (owned by handlers). */
  asr: AsrStream | null = null;

  readonly stats = { sent: 0, droppedPartials: 0 };

  private readonly socket: SocketLike;
  private readonly deps: Required<Omit<ConnectionDeps, "logger">> & { logger: Logger };
  private subscription: Subscription | null = null;
  private alive = true;
  private lastActivity = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  /** Serializes stateful message handling so frames are processed in order. */
  private queue: Promise<void> = Promise.resolve();

  constructor(socket: SocketLike, ctx: TenantContext, deps: ConnectionDeps, nowMs = () => 0) {
    this.socket = socket;
    this.ctx = ctx;
    this.deps = {
      hub: deps.hub,
      logger: deps.logger,
      maxBufferedBytes: deps.maxBufferedBytes ?? 1_000_000,
      heartbeatMs: deps.heartbeatMs ?? 15_000,
      idleTimeoutMs: deps.idleTimeoutMs ?? 60_000,
    };
    this.now = nowMs;
    this.lastActivity = nowMs();
  }

  private now: () => number;

  /**
   * Write a frame to the socket, honoring backpressure: if the outbound buffer
   * is over the cap, interim `partial` frames are dropped (finals — segments,
   * note.* — always go through) so a slow consumer never OOMs the server.
   */
  send(msg: ServerMessage): void {
    if (this.socket.readyState !== OPEN) return;
    if (
      isDroppableUnderBackpressure(msg) &&
      this.socket.bufferedAmount > this.deps.maxBufferedBytes
    ) {
      this.stats.droppedPartials += 1;
      this.deps.logger.debug(
        { orgId: this.ctx.orgId, sessionId: this.sessionId, buffered: this.socket.bufferedAmount },
        "realtime.backpressure.drop_partial",
      );
      return;
    }
    this.socket.send(serializeServerMessage(msg));
    this.stats.sent += 1;
  }

  /** Publish a frame to the session channel (fan-out to all replicas). */
  async publish(msg: ServerMessage): Promise<void> {
    if (!this.sessionId) return;
    await this.deps.hub.publish(this.ctx.orgId, this.sessionId, msg);
  }

  /**
   * Bind this socket to `sessionId`, (re)subscribing to its channel. Safe to call
   * on reconnect with the same id — a dropped socket resumes the same channel.
   */
  async bindSession(sessionId: string): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.sessionId = sessionId;
    this.subscription = await this.deps.hub.subscribe(this.ctx.orgId, sessionId, (m) =>
      this.send(m),
    );
  }

  /**
   * Run `task` after all previously-enqueued tasks for this socket finish. The
   * WS protocol is stateful (start must set up the ASR stream before a following
   * `audio`/`simulate` frame uses it), so frames are handled strictly in order
   * even though each handler is async. A failing task never breaks the chain.
   */
  enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  /** Record inbound activity (resets the idle timeout). */
  markActivity(): void {
    this.lastActivity = this.now();
    this.alive = true;
  }

  /** Acknowledge a pong from the client. */
  onPong(): void {
    this.alive = true;
  }

  /** Start the ping/pong heartbeat + idle-timeout loop. */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return;
      if (this.now() - this.lastActivity > this.deps.idleTimeoutMs) {
        this.deps.logger.info(
          { orgId: this.ctx.orgId, sessionId: this.sessionId },
          "realtime.idle_timeout",
        );
        this.socket.close(4408, "idle timeout");
        return;
      }
      if (!this.alive) {
        this.socket.terminate();
        return;
      }
      this.alive = false;
      try {
        this.socket.ping();
      } catch {
        this.socket.terminate();
      }
    }, this.deps.heartbeatMs);
    // Don't keep the event loop alive for the heartbeat alone.
    (this.heartbeatTimer as { unref?: () => void }).unref?.();
  }

  /** Tear down: stop heartbeat, unsubscribe, close the ASR stream. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.asr?.close();
    if (this.subscription) {
      await this.subscription.unsubscribe().catch(() => undefined);
      this.subscription = null;
    }
  }
}
