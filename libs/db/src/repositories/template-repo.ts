import { and, eq } from "drizzle-orm";
import { type NoteTemplate, NoteFormat } from "@cura/shared";
import { noteTemplates } from "../schema.js";
import { BaseRepo } from "./base.js";

type TemplateRow = typeof noteTemplates.$inferSelect;

/** Note templates per org. Returns the shared `NoteTemplate` domain type. */
export class TemplateRepo extends BaseRepo {
  private map(r: TemplateRow): NoteTemplate {
    return {
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      format: NoteFormat.parse(r.format),
      sections: r.sections,
      styleExamples: r.styleExamples,
      modalityHints: r.modalityHints,
      isDefault: r.isDefault,
    };
  }

  async create(
    orgId: string,
    input: Omit<NoteTemplate, "orgId" | "id"> & { id?: string },
  ): Promise<NoteTemplate> {
    const [row] = await this.db
      .insert(noteTemplates)
      .values({
        ...(input.id ? { id: input.id } : {}),
        orgId,
        name: input.name,
        format: input.format,
        sections: input.sections,
        styleExamples: input.styleExamples ?? [],
        modalityHints: input.modalityHints ?? [],
        isDefault: input.isDefault ?? false,
      })
      .returning();
    return this.map(row!);
  }

  async byId(orgId: string, id: string): Promise<NoteTemplate | null> {
    const [row] = await this.db
      .select()
      .from(noteTemplates)
      .where(and(eq(noteTemplates.orgId, orgId), eq(noteTemplates.id, id)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async list(orgId: string): Promise<NoteTemplate[]> {
    const rows = await this.db.select().from(noteTemplates).where(eq(noteTemplates.orgId, orgId));
    return rows.map((r) => this.map(r));
  }

  async defaultTemplate(orgId: string): Promise<NoteTemplate | null> {
    const all = await this.list(orgId);
    return all.find((t) => t.isDefault) ?? all[0] ?? null;
  }
}
