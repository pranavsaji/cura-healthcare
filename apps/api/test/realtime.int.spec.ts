import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import type { ServerMessage } from "@cura/shared";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform, type Platform } from "../src/platform/index.js";
import { registerRealtime, RealtimeHub } from "../src/realtime/index.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../src/platform/directory.js";

/**
 * Realtime integration over real WebSocket sockets (no Docker) + a Redis
 * multi-replica test (Testcontainers, skipped automatically if Docker is
 * unavailable). Covers: unauthenticated upgrade refused, an authenticated
 * capture→note flow end to end, and cross-replica fan-out.
 */
const SECRET = "test-secret-at-least-16-chars-long";

/** Collect frames until `predicate` is satisfied (or time out). */
function collectUntil(
  ws: WebSocket,
  predicate: (msgs: ServerMessage[]) => boolean,
  timeoutMs = 4000,
): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const msgs: ServerMessage[] = [];
    const timer = setTimeout(() => reject(new Error(`timeout; got ${JSON.stringify(msgs)}`)), timeoutMs);
    ws.on("message", (data) => {
      msgs.push(JSON.parse(data.toString()) as ServerMessage);
      if (predicate(msgs)) {
        clearTimeout(timer);
        resolve(msgs);
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("realtime over websocket", () => {
  let app: FastifyInstance;
  let platform: Platform;
  let url: string;
  let token: string;

  beforeAll(async () => {
    platform = createMemoryPlatform({ sessionSecret: SECRET, devFallback: false });
    app = await buildApp(platform, { realtime: registerRealtime(platform) });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    url = `ws://127.0.0.1:${port}/ws`;
    token = platform.auth.issueSession({
      userId: DEV_USER_IDS.clinician,
      orgId: DEV_ORG_ID,
      role: "clinician",
    });
  });

  afterAll(async () => await app.close());

  it("refuses an unauthenticated upgrade", async () => {
    const ws = new WebSocket(url);
    const result = await new Promise<string>((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("unexpected-response", (_req, res) => resolve(`http ${res.statusCode}`));
      ws.on("error", () => resolve("error"));
    });
    expect(result).toMatch(/http 401|error/);
    ws.close();
  });

  it("runs an authenticated capture → transcript → note flow", async () => {
    // Create a session over HTTP first (same tenant as the token).
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { authorization: `Bearer ${token}` },
      payload: { clientLabel: "S. Mitchell · 32F", source: "live" },
    });
    const sessionId = created.json().id as string;

    // Consent precedes capture (CONVENTIONS §6) — required before WS start.
    await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/consent`,
      headers: { authorization: `Bearer ${token}` },
    });

    const ws = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    const done = collectUntil(ws, (m) => m.some((x) => x.type === "note.done"));
    ws.send(JSON.stringify({ type: "start", sessionId }));
    ws.send(JSON.stringify({ type: "simulate", text: "I have been anxious.", speaker: "client" }));
    ws.send(JSON.stringify({ type: "stop" }));

    const msgs = await done;
    const types = msgs.map((m) => m.type);
    expect(types).toContain("ready");
    expect(types).toContain("segment");
    expect(types).toContain("note.section");
    expect(types).toContain("note.done");
    ws.close();
  });
});

// Redis-backed two-replica fan-out. Skips cleanly when Docker is unavailable.
describe("realtime fan-out via Redis (two replicas)", () => {
  it("delivers a message published on replica A to a subscriber on replica B", async () => {
    let container: { getConnectionUrl(): string; stop(): Promise<unknown> } | undefined;
    let RedisPubSubCls: typeof import("../src/realtime/pubsub.js").RedisPubSub;
    let IORedis: typeof import("ioredis").default;
    try {
      const { RedisContainer } = await import("@testcontainers/redis");
      ({ RedisPubSub: RedisPubSubCls } = await import("../src/realtime/pubsub.js"));
      ({ default: IORedis } = await import("ioredis"));
      container = await new RedisContainer("redis:7-alpine").start();
    } catch (err) {
      // No Docker in this environment → the in-memory broker test already proves
      // the fan-out contract; skip the containerized variant.
      console.warn("skipping Redis fan-out test (no Docker):", (err as Error).message);
      return;
    }

    const urlR = container.getConnectionUrl();
    const hubA = new RealtimeHub(new RedisPubSubCls(new IORedis(urlR), new IORedis(urlR)));
    const hubB = new RealtimeHub(new RedisPubSubCls(new IORedis(urlR), new IORedis(urlR)));

    try {
      const received: ServerMessage[] = [];
      await hubB.subscribe(DEV_ORG_ID, "sess_r", (m) => received.push(m));
      // Allow the SUBSCRIBE to register before publishing.
      await new Promise((r) => setTimeout(r, 100));
      await hubA.publish(DEV_ORG_ID, "sess_r", { type: "note.done", noteId: "n_redis" });
      await new Promise((r) => setTimeout(r, 200));
      expect(received).toEqual([{ type: "note.done", noteId: "n_redis" }]);
    } finally {
      await hubA.close();
      await hubB.close();
      await container.stop();
    }
  }, 60_000);
});
