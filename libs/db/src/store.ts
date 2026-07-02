import { type Session, type Note, type NoteTemplate, type TranscriptSegment } from "@cura/shared";
import type { Repositories } from "./repositories/index.js";

/**
 * The persistence facade the API/services use. Both the in-memory dev store and
 * the Postgres-backed {@link PostgresStore} implement it, so swapping storage is
 * a one-line change (select by `DATABASE_URL`). All methods are async so the two
 * implementations are interchangeable. Tenancy is bound at construction: a store
 * instance is scoped to one org + acting user.
 */
export interface Store {
  readonly orgId: string;
  readonly userId: string;

  listTemplates(): Promise<NoteTemplate[]>;
  getTemplate(id: string): Promise<NoteTemplate | undefined>;
  defaultTemplate(): Promise<NoteTemplate>;
  templateForSession(sessionId: string): Promise<NoteTemplate>;

  createSession(input: StoreCreateSessionInput): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  listSessions(): Promise<Session[]>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session | undefined>;

  appendSegment(sessionId: string, seg: TranscriptSegment): Promise<void>;
  getTranscript(sessionId: string): Promise<TranscriptSegment[]>;
  /** Replace the whole transcript in one shot (e.g. after a batch ASR re-pass). */
  replaceTranscript(sessionId: string, segments: TranscriptSegment[]): Promise<void>;

  /** Persist a freshly generated note; the store owns id + timestamps. */
  createNote(input: StoreCreateNoteInput): Promise<Note>;
  getNote(id: string): Promise<Note | undefined>;
  getNoteBySession(sessionId: string): Promise<Note | undefined>;
  updateNote(id: string, patch: Partial<Note>): Promise<Note | undefined>;
}

export interface StoreCreateSessionInput {
  clientLabel: string;
  clientId?: string | null;
  modality?: string | null;
  source: Session["source"];
  templateId?: string;
}

export interface StoreCreateNoteInput {
  sessionId: string;
  templateId: string | null;
  format: Note["format"];
  sections: Note["sections"];
  riskFlags: Note["riskFlags"];
  status: Note["status"];
  model: string | null;
  promptVersion: string | null;
}

/**
 * Postgres-backed store built on the tenant-scoped repositories. Every call is
 * automatically scoped to `orgId`; `clinicianId` is the acting user for created
 * sessions. Note ids/timestamps are DB-generated, so callers must use the
 * returned `Note` (never fabricate an id).
 */
export class PostgresStore implements Store {
  readonly orgId: string;
  readonly userId: string;

  constructor(
    private readonly repos: Repositories,
    scope: { orgId: string; clinicianId: string },
  ) {
    this.orgId = scope.orgId;
    this.userId = scope.clinicianId;
  }

  listTemplates(): Promise<NoteTemplate[]> {
    return this.repos.templates.list(this.orgId);
  }
  async getTemplate(id: string): Promise<NoteTemplate | undefined> {
    return (await this.repos.templates.byId(this.orgId, id)) ?? undefined;
  }
  async defaultTemplate(): Promise<NoteTemplate> {
    const t = await this.repos.templates.defaultTemplate(this.orgId);
    if (!t) throw new Error("no templates seeded for org");
    return t;
  }
  async templateForSession(sessionId: string): Promise<NoteTemplate> {
    const tid = await this.repos.sessions.templateId(this.orgId, sessionId);
    if (tid) {
      const t = await this.repos.templates.byId(this.orgId, tid);
      if (t) return t;
    }
    return this.defaultTemplate();
  }

  async createSession(input: StoreCreateSessionInput): Promise<Session> {
    return this.repos.sessions.create(this.orgId, {
      clinicianId: this.userId,
      clientId: input.clientId ?? null,
      clientLabel: input.clientLabel,
      templateId: input.templateId ?? null,
      modality: input.modality ?? null,
      source: input.source,
    });
  }
  async getSession(id: string): Promise<Session | undefined> {
    return (await this.repos.sessions.byId(this.orgId, id)) ?? undefined;
  }
  async listSessions(): Promise<Session[]> {
    return (await this.repos.sessions.list(this.orgId, { limit: 100 })).items;
  }
  async updateSession(id: string, patch: Partial<Session>): Promise<Session | undefined> {
    return (await this.repos.sessions.update(this.orgId, id, patch)) ?? undefined;
  }

  appendSegment(sessionId: string, seg: TranscriptSegment): Promise<void> {
    return this.repos.transcripts.append(this.orgId, sessionId, seg);
  }
  getTranscript(sessionId: string): Promise<TranscriptSegment[]> {
    return this.repos.transcripts.get(this.orgId, sessionId);
  }
  replaceTranscript(sessionId: string, segments: TranscriptSegment[]): Promise<void> {
    return this.repos.transcripts.replace(this.orgId, sessionId, segments);
  }

  createNote(input: StoreCreateNoteInput): Promise<Note> {
    return this.repos.notes.create(this.orgId, input);
  }
  async getNote(id: string): Promise<Note | undefined> {
    return (await this.repos.notes.byId(this.orgId, id)) ?? undefined;
  }
  async getNoteBySession(sessionId: string): Promise<Note | undefined> {
    return (await this.repos.notes.bySession(this.orgId, sessionId)) ?? undefined;
  }
  async updateNote(id: string, patch: Partial<Note>): Promise<Note | undefined> {
    return (await this.repos.notes.update(this.orgId, id, patch)) ?? undefined;
  }
}
