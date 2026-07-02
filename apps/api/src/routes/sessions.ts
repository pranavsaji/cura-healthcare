import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateSessionInput, NotFoundError } from "@cura/shared";
import { requirePermission } from "@cura/auth";
import { generateNoteForSession } from "../notegen.js";
import { tenantOf } from "../plugins/context.js";
import { IdParams } from "../schemas.js";

const canManage = requirePermission("sessions:manage");
const canRead = requirePermission("notes:read");
const canWrite = requirePermission("notes:write");

/** Upload ingest body: base64 audio (dev-friendly; mirrors the WS audio frame). */
const UploadAudioInput = z.object({
  audio: z.string().min(1), // base64-encoded audio bytes
  contentType: z.string().optional(),
  ext: z.string().optional(),
});
const PresignInput = z.object({ contentType: z.string().optional(), ext: z.string().optional() }).optional();

/**
 * Recording-session routes. Thin: lifecycle + consent + capture live in
 * `@cura/scribe` (`platform.scribe`), so these handlers just authorize, resolve
 * the tenant store, and delegate. Consent is enforced centrally by the scribe
 * services; the "upload audio" path presigns direct-to-storage or ingests base64.
 */
export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const scribe = () => app.platform.scribe;

  r.get("/sessions", async (req) => {
    const ctx = tenantOf(req);
    canManage(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    return store.listSessions();
  });

  r.post("/sessions", { schema: { body: CreateSessionInput } }, async (req, reply) => {
    const ctx = tenantOf(req);
    canManage(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const session = await scribe().sessions.create(store, {
      clientLabel: req.body.clientLabel,
      clientId: req.body.clientId ?? null,
      modality: req.body.modality ?? null,
      source: req.body.source,
      ...(req.body.templateId ? { templateId: req.body.templateId } : {}),
    });
    return reply.code(201).send(session);
  });

  r.get("/sessions/:id", { schema: { params: IdParams } }, async (req) => {
    const ctx = tenantOf(req);
    canRead(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const session = await store.getSession(req.params.id);
    if (!session) throw new NotFoundError("session");
    return {
      session,
      transcript: await store.getTranscript(session.id),
      note: (await store.getNoteBySession(session.id)) ?? null,
    };
  });

  r.post("/sessions/:id/consent", { schema: { params: IdParams } }, async (req) => {
    const ctx = tenantOf(req);
    canManage(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    return scribe().sessions.recordConsent(store, req.params.id);
  });

  // "Upload audio" path — presign a direct-to-storage PUT (consent required).
  r.post("/sessions/:id/upload-url", { schema: { params: IdParams, body: PresignInput } }, async (req) => {
    const ctx = tenantOf(req);
    canManage(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    return scribe().transcripts.presignUpload(store, req.params.id, {
      ...(req.body?.contentType ? { contentType: req.body.contentType } : {}),
      ...(req.body?.ext ? { ext: req.body.ext } : {}),
    });
  });

  // "Upload audio" path — ingest bytes now (base64) and run the batch re-pass.
  r.post("/sessions/:id/audio", { schema: { params: IdParams, body: UploadAudioInput } }, async (req, reply) => {
    const ctx = tenantOf(req);
    canManage(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const audio = Buffer.from(req.body.audio, "base64");
    const result = await scribe().transcripts.ingestUpload(store, req.params.id, audio, {
      ...(req.body.contentType ? { contentType: req.body.contentType } : {}),
      ...(req.body.ext ? { ext: req.body.ext } : {}),
    });
    return reply.code(201).send(result);
  });

  r.post("/sessions/:id/generate", { schema: { params: IdParams } }, async (req, reply) => {
    const ctx = tenantOf(req);
    canWrite(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const session = await store.getSession(req.params.id);
    if (!session) throw new NotFoundError("session");
    const note = await generateNoteForSession(store, session.id);
    await app.platform.audit.record({
      orgId: ctx.orgId,
      actor: ctx.userId,
      action: "note.generated",
      resource: `note:${note.id}`,
      phiTouched: true,
      context: { sessionId: session.id, model: note.model },
    });
    return reply.code(201).send(note);
  });
}
