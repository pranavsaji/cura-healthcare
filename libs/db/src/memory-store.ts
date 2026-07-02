import { randomUUID } from "node:crypto";
import {
  type Session,
  type Note,
  type NoteTemplate,
  type TranscriptSegment,
  type NoteFormat,
  sectionsForFormat,
} from "@cura/shared";
import type { Store, StoreCreateSessionInput, StoreCreateNoteInput } from "./store.js";

/**
 * In-memory {@link Store} so the whole product runs with zero external services
 * in dev and tests. Mirrors {@link PostgresStore} exactly (async, tenant-scoped),
 * so swapping to Postgres is a one-line change in the store factory. Lives in
 * `@cura/db` (not an app) so every consumer — the API, the worker, and the
 * `@cura/scribe` service tests — reuses one implementation (CONVENTIONS §8).
 */
export class MemoryStore implements Store {
  readonly orgId: string;
  readonly userId: string;

  private sessions = new Map<string, Session>();
  private transcripts = new Map<string, TranscriptSegment[]>();
  private notes = new Map<string, Note>();
  private notesBySession = new Map<string, string>();
  private templates = new Map<string, NoteTemplate>();
  private sessionTemplate = new Map<string, string>();

  constructor(scope: { orgId: string; userId: string } = { orgId: "org_dev", userId: "user_dev" }) {
    this.orgId = scope.orgId;
    this.userId = scope.userId;
    this.seedTemplates();
  }

  private now = () => new Date().toISOString();

  private seedTemplates(): void {
    const formats: NoteFormat[] = ["SOAP", "DAP", "BIRP", "GIRP"];
    for (const format of formats) {
      const id = `tmpl_${format.toLowerCase()}`;
      this.templates.set(id, {
        id,
        orgId: this.orgId,
        name: `${format} — Progress Note`,
        format,
        sections: sectionsForFormat(format),
        styleExamples: [],
        modalityHints: [],
        isDefault: format === "SOAP",
      });
    }
  }

  async listTemplates(): Promise<NoteTemplate[]> {
    return [...this.templates.values()];
  }
  async getTemplate(id: string): Promise<NoteTemplate | undefined> {
    return this.templates.get(id);
  }
  async defaultTemplate(): Promise<NoteTemplate> {
    const all = [...this.templates.values()];
    return all.find((t) => t.isDefault) ?? all[0]!;
  }
  async templateForSession(sessionId: string): Promise<NoteTemplate> {
    const tid = this.sessionTemplate.get(sessionId);
    return (tid && this.templates.get(tid)) || this.defaultTemplate();
  }

  async createSession(input: StoreCreateSessionInput): Promise<Session> {
    const id = `sess_${randomUUID()}`;
    const session: Session = {
      id,
      orgId: this.orgId,
      clinicianId: this.userId,
      clientId: input.clientId ?? null,
      clientLabel: input.clientLabel,
      modality: input.modality ?? null,
      source: input.source,
      status: "created",
      consentAt: null,
      startedAt: null,
      endedAt: null,
      createdAt: this.now(),
    };
    this.sessions.set(id, session);
    this.transcripts.set(id, []);
    if (input.templateId) this.sessionTemplate.set(id, input.templateId);
    return session;
  }
  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }
  async listSessions(): Promise<Session[]> {
    return [...this.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async updateSession(id: string, patch: Partial<Session>): Promise<Session | undefined> {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    const next = { ...s, ...patch };
    this.sessions.set(id, next);
    return next;
  }

  async appendSegment(sessionId: string, seg: TranscriptSegment): Promise<void> {
    const arr = this.transcripts.get(sessionId) ?? [];
    arr.push(seg);
    this.transcripts.set(sessionId, arr);
  }
  async getTranscript(sessionId: string): Promise<TranscriptSegment[]> {
    return this.transcripts.get(sessionId) ?? [];
  }
  /** Replace the whole transcript (used by the batch re-pass). */
  async replaceTranscript(sessionId: string, segments: TranscriptSegment[]): Promise<void> {
    this.transcripts.set(sessionId, [...segments]);
  }

  async createNote(input: StoreCreateNoteInput): Promise<Note> {
    const id = `note_${randomUUID()}`;
    const note: Note = {
      id,
      orgId: this.orgId,
      sessionId: input.sessionId,
      templateId: input.templateId,
      format: input.format,
      sections: input.sections,
      riskFlags: input.riskFlags,
      status: input.status,
      model: input.model,
      promptVersion: input.promptVersion,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.notes.set(id, note);
    this.notesBySession.set(input.sessionId, id);
    return note;
  }
  async getNote(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
  }
  async getNoteBySession(sessionId: string): Promise<Note | undefined> {
    const id = this.notesBySession.get(sessionId);
    return id ? this.notes.get(id) : undefined;
  }
  async updateNote(id: string, patch: Partial<Note>): Promise<Note | undefined> {
    const n = this.notes.get(id);
    if (!n) return undefined;
    const next = { ...n, ...patch, updatedAt: this.now() };
    this.notes.set(id, next);
    return next;
  }
}
