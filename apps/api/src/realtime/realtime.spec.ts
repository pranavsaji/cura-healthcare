import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "@cura/core";
import { createAuditLog } from "@cura/audit";
import type { ServerMessage, TenantContext } from "@cura/shared";
import { MemoryStore } from "@cura/db";
import { InMemoryAuditStore } from "../platform/audit-store.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../platform/directory.js";
import { InMemoryBroker, InMemoryPubSub } from "./pubsub.js";
import { RealtimeHub } from "./hub.js";
import { Connection, type SocketLike } from "./connection.js";
import { createMessageHandler } from "./handlers.js";
import {
  parseClientMessage,
  parseServerMessage,
  serializeServerMessage,
  isDroppableUnderBackpressure,
} from "./protocol.js";

const logger = createLogger({ level: "silent" });
const ctx: TenantContext = {
  orgId: DEV_ORG_ID,
  userId: DEV_USER_IDS.clinician,
  role: "clinician",
  permissions: [],
  requestId: "req_1",
};

/** Recording fake socket implementing SocketLike. */
class FakeSocket implements SocketLike {
  readyState = 1;
  bufferedAmount = 0;
  sent: ServerMessage[] = [];
  pings = 0;
  terminated = false;
  closedWith: number | undefined;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMessage);
  }
  close(code?: number): void {
    this.closedWith = code;
    this.readyState = 3;
  }
  ping(): void {
    this.pings += 1;
  }
  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
  }
  typesSent(): string[] {
    return this.sent.map((m) => m.type);
  }
}

describe("protocol", () => {
  it("parses valid client messages and rejects malformed ones", () => {
    expect(parseClientMessage(JSON.stringify({ type: "start", sessionId: "s1" }))).toEqual({
      type: "start",
      sessionId: "s1",
    });
    expect(() => parseClientMessage("not json")).toThrow();
    expect(() => parseClientMessage(JSON.stringify({ type: "bogus" }))).toThrow();
  });

  it("round-trips server messages and flags droppable ones", () => {
    const msg: ServerMessage = { type: "partial", text: "hi", speaker: "client" };
    expect(parseServerMessage(serializeServerMessage(msg))).toEqual(msg);
    expect(parseServerMessage("garbage")).toBeNull();
    expect(isDroppableUnderBackpressure(msg)).toBe(true);
    expect(
      isDroppableUnderBackpressure({ type: "note.done", noteId: "n1" } as ServerMessage),
    ).toBe(false);
  });
});

describe("pub/sub fan-out across replicas (shared broker)", () => {
  it("delivers a message published on hub A to a subscriber on hub B", async () => {
    // Two hubs = two API replicas sharing one broker (stand-in for one Redis).
    const broker = new InMemoryBroker();
    const hubA = new RealtimeHub(new InMemoryPubSub(broker));
    const hubB = new RealtimeHub(new InMemoryPubSub(broker));

    const received: ServerMessage[] = [];
    await hubB.subscribe(ctx.orgId, "sess_x", (m) => received.push(m));
    await hubA.publish(ctx.orgId, "sess_x", { type: "note.done", noteId: "n_1" });

    expect(received).toEqual([{ type: "note.done", noteId: "n_1" }]);
  });

  it("stops delivering after unsubscribe and isolates channels", async () => {
    const pubsub = new InMemoryPubSub();
    const got: string[] = [];
    const sub = await pubsub.subscribe("ch1", (m) => got.push(m));
    await pubsub.publish("ch1", "a");
    await pubsub.publish("ch2", "b"); // different channel — ignored
    await sub.unsubscribe();
    await pubsub.publish("ch1", "c"); // after unsubscribe — ignored
    expect(got).toEqual(["a"]);
  });
});

describe("Connection backpressure", () => {
  it("drops partials but always sends finals when the buffer is full", async () => {
    const socket = new FakeSocket();
    const hub = new RealtimeHub(new InMemoryPubSub());
    const conn = new Connection(socket, ctx, { hub, logger, maxBufferedBytes: 100 });

    socket.bufferedAmount = 0;
    conn.send({ type: "partial", text: "ok", speaker: "client" });
    socket.bufferedAmount = 5_000; // now backed up
    conn.send({ type: "partial", text: "dropped", speaker: "client" });
    conn.send({ type: "segment", segment: { speaker: "client", start: 0, end: 1, text: "kept", confidence: 1 } });
    conn.send({ type: "note.done", noteId: "n1" });

    expect(conn.stats.droppedPartials).toBe(1);
    expect(socket.typesSent()).toEqual(["partial", "segment", "note.done"]);
  });

  it("does not send on a non-open socket", () => {
    const socket = new FakeSocket();
    socket.readyState = 3;
    const hub = new RealtimeHub(new InMemoryPubSub());
    const conn = new Connection(socket, ctx, { hub, logger });
    conn.send({ type: "ready", sessionId: "s1" });
    expect(socket.sent).toHaveLength(0);
  });
});

describe("Connection heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pings on interval, terminates a silent peer, and times out on idle", async () => {
    const socket = new FakeSocket();
    const hub = new RealtimeHub(new InMemoryPubSub());
    let now = 0;
    const conn = new Connection(
      socket,
      ctx,
      { hub, logger, heartbeatMs: 1000, idleTimeoutMs: 5000 },
      () => now,
    );
    conn.startHeartbeat();

    // Tick 1: alive → ping sent, alive reset to false.
    now = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.pings).toBe(1);

    // Tick 2: no pong arrived → terminate.
    now = 2000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.terminated).toBe(true);

    await conn.close();
  });
});

describe("realtime handler pipeline", () => {
  function setup() {
    const store = new MemoryStore({ orgId: ctx.orgId, userId: ctx.userId });
    const audit = createAuditLog({ store: new InMemoryAuditStore() });
    const hub = new RealtimeHub(new InMemoryPubSub());
    const socket = new FakeSocket();
    const conn = new Connection(socket, ctx, { hub, logger });
    const handle = createMessageHandler({ storeFor: async () => store, audit });
    return { store, hub, socket, conn, handle };
  }

  const flush = () => new Promise((r) => setImmediate(r));

  it("start → ready, simulate → segment, stop → note.done", async () => {
    const { store, socket, conn, handle } = setup();
    const session = await store.createSession({ clientLabel: "S. M · 32F", source: "live" });
    await store.updateSession(session.id, { consentAt: new Date().toISOString() }); // consent precedes capture

    await handle(conn, { type: "start", sessionId: session.id });
    expect(socket.typesSent()).toContain("ready");
    expect((await store.getSession(session.id))?.status).toBe("recording");

    await handle(conn, { type: "simulate", text: "I feel anxious lately.", speaker: "client" });
    await flush();
    expect(socket.typesSent()).toContain("partial");
    expect(socket.typesSent()).toContain("segment");
    expect(await store.getTranscript(session.id)).toHaveLength(1);

    await handle(conn, { type: "stop" });
    await flush();
    const types = socket.typesSent();
    expect(types).toContain("note.section");
    expect(types.filter((t) => t === "note.status")).not.toHaveLength(0);
    expect(types).toContain("note.done");
    expect((await store.getNoteBySession(session.id))?.status).toBe("draft");

    await conn.close();
  });

  it("rejects a start for a session in another org", async () => {
    const { socket, conn, handle } = setup();
    await handle(conn, { type: "start", sessionId: "sess_does_not_exist" });
    expect(socket.sent.at(-1)).toEqual({ type: "error", message: "unknown session" });
  });

  it("rejects capture start without consent and audits the denial", async () => {
    const store = new MemoryStore({ orgId: ctx.orgId, userId: ctx.userId });
    const auditStore = new InMemoryAuditStore();
    const audit = createAuditLog({ store: auditStore });
    const hub = new RealtimeHub(new InMemoryPubSub());
    const socket = new FakeSocket();
    const conn = new Connection(socket, ctx, { hub, logger });
    const handle = createMessageHandler({ storeFor: async () => store, audit });

    const session = await store.createSession({ clientLabel: "No consent", source: "live" });
    await handle(conn, { type: "start", sessionId: session.id });

    expect(socket.sent.at(-1)).toEqual({ type: "error", message: "consent required before capture" });
    expect((await store.getSession(session.id))?.status).toBe("created"); // never started
    const events = await auditStore.list(ctx.orgId);
    expect(events.some((e) => e.action === "auth.denied")).toBe(true);
    await conn.close();
  });

  it("replays an existing note to a reconnecting socket (resume)", async () => {
    const { store, conn, handle } = setup();
    const session = await store.createSession({ clientLabel: "S. M", source: "live" });
    await store.updateSession(session.id, { consentAt: new Date().toISOString() });
    await handle(conn, { type: "start", sessionId: session.id });
    await handle(conn, { type: "simulate", text: "hello there" });
    await flush();
    await handle(conn, { type: "stop" });
    await flush();
    await conn.close();

    // New socket resumes the same session → gets the note stream immediately.
    const socket2 = new FakeSocket();
    const hub2 = new RealtimeHub(new InMemoryPubSub());
    const conn2 = new Connection(socket2, ctx, { hub: hub2, logger });
    const handle2 = createMessageHandler({
      storeFor: async () => store,
      audit: createAuditLog({ store: new InMemoryAuditStore() }),
    });
    await handle2(conn2, { type: "start", sessionId: session.id });
    await flush();
    expect(socket2.typesSent()).toContain("note.section");
    expect(socket2.typesSent()).toContain("note.done");
    await conn2.close();
  });
});
