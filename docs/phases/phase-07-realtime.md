# Phase 07 — Realtime Infrastructure (WebSocket hub)

- **Status:** DONE
- **Owner:** _unassigned_
- **Depends on:** 06
- **Unblocks:** 10 (capture), 12 (live UI), 14 (agent status stream)

## Objective
A robust, horizontally-scalable realtime layer: authenticated WebSocket sessions, the typed message
protocol, **Redis pub/sub fan-out** (so any API replica can serve any socket), backpressure,
heartbeats/reconnection, and clean lifecycle — the transport for audio-in / transcript-out / note-
stream / agent-status.

## Context you need
- Demo exists (`apps/api/src/realtime.ts`) but keeps state in-process (won't scale past one replica).
  This phase makes it multi-replica-safe and hardened.
- Protocol = `ClientMessage`/`ServerMessage` discriminated unions in `@cura/shared` (Phase 01).
- Read CONVENTIONS §2 (stateless apps, Redis fan-out).

## Reusability & scalability mandate
- **No in-memory socket registry as source of truth.** Publish/subscribe channel per session via
  Redis; a socket subscribes to its session's channel; producers publish there. Any replica works.
- One reusable `RealtimeHub` used by all verticals (scribe transcript, Curadesk voice, Curabill
  workflow status) — differentiated by channel/message type, not new transport code.
- Authenticated: the WS upgrade runs the same auth → `TenantContext` as HTTP (Phase 05/06).

## Deliverables
```
apps/api/src/realtime/
  hub.ts             # RealtimeHub: register/unregister, subscribe(sessionId), publish(msg)
  pubsub.ts          # Redis pub/sub adapter (+ in-memory adapter for tests/offline)
  connection.ts      # per-socket lifecycle: auth, heartbeat, backpressure, close
  protocol.ts        # parse/serialize + validate against @cura/shared schemas
  handlers.ts        # start/audio/stop/simulate → domain calls (Phase 10)
  index.ts
apps/api/test/
  realtime.int.spec.ts   # two simulated replicas share a session via Redis
```

## Implementation tasks
1. **PubSub adapter interface** with Redis impl + in-memory impl (tests/offline). Channel naming:
   `rt:{orgId}:{sessionId}`.
2. **Auth on upgrade:** reject unauthenticated sockets; attach `TenantContext`; enforce the socket's
   session belongs to the org.
3. **Backpressure:** bound the outbound queue; if a client is slow, drop partials (keep finals) and
   log; never OOM. Binary audio frames for prod (base64 JSON only in dev/mock).
4. **Heartbeat + reconnect:** ping/pong; idle timeout; client resume token so a dropped socket can
   re-subscribe to the same session channel and get the note stream.
5. **Handlers:** wire `start/audio/stop/simulate` to Phase 10 domain services; emit `partial/segment/
   note.*` back through the hub (published to Redis, delivered by whichever replica holds the socket).
6. **Multi-replica test:** simulate two hub instances sharing one Redis; a message published by hub A
   reaches a socket on hub B.

## Validation gate
```bash
pnpm --filter @cura/api test        # includes realtime.int.spec (Testcontainers Redis)
pnpm --filter @cura/api typecheck
```
- **Acceptance:** message published on replica A is delivered to a subscriber on replica B; an
  unauthenticated upgrade is refused; a slow consumer drops partials but still receives every final
  segment and the `note.done`; killing/reopening a socket resumes the same session channel.

## Definition of Done
- [ ] Fan-out via Redis; verified across two hub instances.
- [ ] WS authenticated + tenant-scoped.
- [ ] Backpressure + heartbeat + reconnect implemented and tested.
- [ ] Protocol strictly validated against shared schemas.

## Handoff notes
Realtime rebuilt under `apps/api/src/realtime/`. Validation gate green: `pnpm --filter @cura/api
typecheck`, unit tests (`realtime.spec.ts`, 10 tests — incl. two-hub fan-out via a shared in-memory
broker, backpressure, heartbeat, full pipeline, resume, cross-tenant reject), and
`realtime.int.spec.ts` (real `ws` sockets: unauthenticated upgrade refused + authenticated
capture→note flow; **Testcontainers Redis two-replica fan-out — passed with Docker present**).

- **Fan-out:** `PubSub` port (`pubsub.ts`) with `RedisPubSub` (ioredis; dedicated subscriber conn) and
  `InMemoryPubSub` over an `InMemoryBroker`. **No in-memory socket registry as source of truth** —
  delivery is via channel subscription, so any replica serves any socket. Two `InMemoryPubSub` sharing
  one broker simulate two replicas in unit tests; prod uses one Redis.
- **Channel naming:** `rt:{orgId}:{sessionId}` (`RealtimeHub.channel`) — org-scoped so a subscription
  can never cross tenants. Exposed on the platform as `platform.pubsub` (Redis when `REDIS_URL` set,
  else in-memory).
- **Auth on upgrade:** `/ws` is a normal protected Fastify route, so the Phase 06 auth + rate-limit
  plugins run on the HTTP upgrade — an unauthenticated upgrade gets `401` before any socket opens, and
  `req.tenant` (TenantContext) is available to the handler. `start` additionally verifies the session's
  org matches the socket's tenant.
- **Backpressure policy:** bounded by `maxBufferedBytes` (default 1 MB). When the outbound buffer is
  over the cap, interim `partial` frames are dropped (counted in `stats.droppedPartials`); finals
  (`segment`, `note.*`) always go through. A slow consumer never OOMs the server.
- **Heartbeat/reconnect:** ping/pong every `heartbeatMs` (default 15s); a silent peer is
  `terminate()`d; no inbound frame within `idleTimeoutMs` (default 60s) → close `4408`. **Resume:** a
  reconnecting socket sends `start` with the same `sessionId`, re-subscribes to the same channel, and
  is replayed the already-generated note (`note.section*` + `note.done`). Resume token = the session id
  itself (no separate token needed; the channel is the durable handle).
- **Message ordering:** `Connection.enqueue` serializes stateful frame handling so `start` finishes
  wiring the ASR stream before a following `audio`/`simulate` frame uses it (fixes a real race).
- **Audio frame format:** base64 JSON `audio` frames in dev/mock (binary frames + real ASR SDK land in
  Phase 08). `simulate` drives the mock ASR with text.
- **Protocol:** every inbound frame is `ClientMessage.parse`d and every outbound frame
  `ServerMessage.parse`d (`protocol.ts`) — strict validation against `@cura/shared`.
- **Wiring:** `buildApp(platform, { realtime: registerRealtime(platform) })` (in `main.ts`). New dev
  dep: `ws` (+ `@types/ws`) for the integration test client.
