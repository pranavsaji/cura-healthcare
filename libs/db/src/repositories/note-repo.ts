import { and, desc, eq } from "drizzle-orm";
import { type Note, NoteFormat, NoteStatus } from "@cura/shared";
import { notes, noteEdits } from "../schema.js";
import { BaseRepo } from "./base.js";

type NoteRow = typeof notes.$inferSelect;

/** Generated clinical notes + their append-only edit log (personalization signal). */
export class NoteRepo extends BaseRepo {
  private map(r: NoteRow): Note {
    return {
      id: r.id,
      orgId: r.orgId,
      sessionId: r.sessionId,
      templateId: r.templateId,
      format: NoteFormat.parse(r.format),
      sections: r.sections,
      riskFlags: r.riskFlags,
      status: NoteStatus.parse(r.status),
      model: r.model,
      promptVersion: r.promptVersion,
      createdAt: this.isoReq(r.createdAt),
      updatedAt: this.isoReq(r.updatedAt),
    };
  }

  async create(
    orgId: string,
    input: Omit<Note, "orgId" | "createdAt" | "updatedAt" | "id"> & { id?: string },
  ): Promise<Note> {
    const [row] = await this.db
      .insert(notes)
      .values({
        ...(input.id ? { id: input.id } : {}),
        orgId,
        sessionId: input.sessionId,
        templateId: input.templateId,
        format: input.format,
        sections: input.sections,
        riskFlags: input.riskFlags ?? [],
        status: input.status,
        model: input.model,
        promptVersion: input.promptVersion,
      })
      .returning();
    return this.map(row!);
  }

  async byId(orgId: string, id: string): Promise<Note | null> {
    const [row] = await this.db
      .select()
      .from(notes)
      .where(and(eq(notes.orgId, orgId), eq(notes.id, id)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async bySession(orgId: string, sessionId: string): Promise<Note | null> {
    const [row] = await this.db
      .select()
      .from(notes)
      .where(and(eq(notes.orgId, orgId), eq(notes.sessionId, sessionId)))
      .orderBy(desc(notes.createdAt))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async update(orgId: string, id: string, patch: Partial<Note>): Promise<Note | null> {
    const [row] = await this.db
      .update(notes)
      .set({
        ...(patch.sections ? { sections: patch.sections } : {}),
        ...(patch.riskFlags ? { riskFlags: patch.riskFlags } : {}),
        ...(patch.status ? { status: patch.status } : {}),
        updatedAt: this.deps.clock.now(),
      })
      .where(and(eq(notes.orgId, orgId), eq(notes.id, id)))
      .returning();
    return row ? this.map(row) : null;
  }

  /** Record an edit diff (before/after) for a section — feeds personalization. */
  async recordEdit(
    orgId: string,
    input: { noteId: string; sectionKey: string; before: string; after: string },
  ): Promise<void> {
    await this.db.insert(noteEdits).values({ orgId, ...input });
  }
}
