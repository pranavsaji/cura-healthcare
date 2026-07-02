import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { NotFoundError, renderNoteText } from "@cura/shared";
import { requirePermission } from "@cura/auth";
import { tenantOf } from "../plugins/context.js";
import { IdParams, SectionPatchBody } from "../schemas.js";

const canRead = requirePermission("notes:read");
const canWrite = requirePermission("notes:write");
const canSign = requirePermission("notes:sign");
const canSync = requirePermission("notes:sync");

/**
 * Note routes: read, edit a section (records a personalization signal + moves to
 * `reviewed`), sign, and sync ("Super Fill" → EHR; dev fallback returns the
 * formatted text to paste). Signing and syncing require their own permissions,
 * and every mutation is audited with `phiTouched` set.
 */
export async function noteRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/notes/:id", { schema: { params: IdParams } }, async (req) => {
    const ctx = tenantOf(req);
    canRead(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const note = await store.getNote(req.params.id);
    if (!note) throw new NotFoundError("note");
    return note;
  });

  r.patch(
    "/notes/:id/section",
    { schema: { params: IdParams, body: SectionPatchBody } },
    async (req) => {
      const ctx = tenantOf(req);
      canWrite(ctx);
      const store = await app.platform.stores.forTenant(ctx);
      const note = await store.getNote(req.params.id);
      if (!note) throw new NotFoundError("note");
      const sections = note.sections.map((sec) =>
        sec.key === req.body.sectionKey ? { ...sec, content: req.body.content } : sec,
      );
      const updated = await store.updateNote(note.id, { sections, status: "reviewed" });
      await app.platform.audit.record({
        orgId: ctx.orgId,
        actor: ctx.userId,
        action: "note.edited",
        resource: `note:${note.id}`,
        phiTouched: true,
        context: { sectionKey: req.body.sectionKey },
      });
      return updated;
    },
  );

  r.post("/notes/:id/sign", { schema: { params: IdParams } }, async (req) => {
    const ctx = tenantOf(req);
    canSign(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const note = await store.getNote(req.params.id);
    if (!note) throw new NotFoundError("note");
    const updated = await store.updateNote(note.id, { status: "signed" });
    await app.platform.audit.record({
      orgId: ctx.orgId,
      actor: ctx.userId,
      action: "note.signed",
      resource: `note:${note.id}`,
      phiTouched: true,
    });
    return updated;
  });

  r.post("/notes/:id/sync", { schema: { params: IdParams } }, async (req) => {
    const ctx = tenantOf(req);
    canSync(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    const note = await store.getNote(req.params.id);
    if (!note) throw new NotFoundError("note");
    const updated = await store.updateNote(note.id, { status: "synced" });
    await app.platform.audit.record({
      orgId: ctx.orgId,
      actor: ctx.userId,
      action: "note.synced",
      resource: `note:${note.id}`,
      phiTouched: true,
    });
    return { note: updated, formatted: renderNoteText(note) };
  });
}
