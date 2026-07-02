import type { AuditLog } from "@cura/audit";
import type { Store } from "@cura/db";
import type { ClientMessage } from "@cura/shared";
import { generateNoteForSession } from "../notegen.js";
import { createAsrStream } from "../providers/asr.js";
import type { Connection } from "./connection.js";

/**
 * Domain wiring for the WS protocol. `start/audio/stop/simulate` drive the
 * capture → transcript → note pipeline and emit `partial/segment/note.*` back
 * **through the hub** (published to the session channel, delivered by whichever
 * replica holds the socket). Ack-style frames (`ready`, `error`) are sent
 * directly to the originating socket.
 */
export interface HandlerDeps {
  storeFor(ctx: { orgId: string; userId: string }): Promise<Store>;
  audit: AuditLog;
}

export type MessageHandler = (conn: Connection, msg: ClientMessage) => Promise<void>;

export function createMessageHandler(deps: HandlerDeps): MessageHandler {
  return async function handle(conn, msg) {
    switch (msg.type) {
      case "start":
        return start(deps, conn, msg.sessionId);
      case "audio":
        conn.asr?.pushAudio(Buffer.from(msg.chunk, "base64"));
        return;
      case "simulate":
        conn.asr?.pushText(msg.text, msg.speaker ?? "client");
        return;
      case "stop":
        return stop(deps, conn);
    }
  };
}

async function start(deps: HandlerDeps, conn: Connection, sessionId: string): Promise<void> {
  const store = await deps.storeFor(conn.ctx);
  const session = await store.getSession(sessionId);
  // Tenant enforcement: the socket's org must own the session.
  if (!session || session.orgId !== conn.ctx.orgId) {
    conn.send({ type: "error", message: "unknown session" });
    return;
  }

  // Consent gate: capture cannot start without a logged consent event
  // (CONVENTIONS §6). A denied attempt is audited, not silently dropped.
  if (!session.consentAt) {
    await deps.audit.record({
      orgId: conn.ctx.orgId,
      actor: conn.ctx.userId,
      action: "auth.denied",
      resource: `session:${sessionId}`,
      phiTouched: false,
      context: { reason: "consent_required", action: "session.start" },
    });
    conn.send({ type: "error", message: "consent required before capture" });
    return;
  }

  // Subscribe BEFORE producing so this socket receives its own published frames
  // (and any other replica's) — resume-safe on reconnect with the same id.
  await conn.bindSession(sessionId);

  await store.updateSession(sessionId, {
    status: "recording",
    startedAt: new Date().toISOString(),
  });

  // Resume: replay an already-generated note to a reconnecting client.
  const existingNote = await store.getNoteBySession(sessionId);
  if (existingNote) {
    for (const section of existingNote.sections) conn.send({ type: "note.section", section });
    conn.send({ type: "note.done", noteId: existingNote.id });
  }

  conn.asr = createAsrStream({
    onPartial: (text, speaker) => {
      void conn.publish({ type: "partial", text, speaker });
    },
    onSegment: (segment) => {
      void store.appendSegment(sessionId, segment).then(() =>
        conn.publish({ type: "segment", segment }),
      );
    },
  });

  await deps.audit.record({
    orgId: conn.ctx.orgId,
    actor: conn.ctx.userId,
    action: "session.started",
    resource: `session:${sessionId}`,
    phiTouched: false,
  });

  conn.send({ type: "ready", sessionId });
}

async function stop(deps: HandlerDeps, conn: Connection): Promise<void> {
  const sessionId = conn.sessionId;
  if (!sessionId) return;
  conn.asr?.close();
  conn.asr = null;

  const store = await deps.storeFor(conn.ctx);
  await store.updateSession(sessionId, {
    status: "transcribing",
    endedAt: new Date().toISOString(),
  });

  await conn.publish({ type: "note.status", status: "generating" });
  try {
    const note = await generateNoteForSession(store, sessionId, {
      onSection: (section) => void conn.publish({ type: "note.section", section }),
      onRisk: (flag) => void conn.publish({ type: "note.risk", flag }),
    });
    await deps.audit.record({
      orgId: conn.ctx.orgId,
      actor: conn.ctx.userId,
      action: "note.generated",
      resource: `note:${note.id}`,
      phiTouched: true,
      context: { sessionId, model: note.model },
    });
    await conn.publish({ type: "note.status", status: "done" });
    await conn.publish({ type: "note.done", noteId: note.id });
  } catch (err) {
    conn.send({ type: "note.status", status: "error" });
    conn.send({ type: "error", message: "note generation failed" });
    void err;
  }
}
