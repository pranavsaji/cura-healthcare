import { systemClock, uuidIdGen } from "@cura/core";
import { createEncryptor, staticKeyProvider, type Encryptor } from "../encryption.js";
import type { Database } from "../client.js";
import type { RepoDeps } from "./base.js";
import { OrgRepo } from "./org-repo.js";
import { UserRepo } from "./user-repo.js";
import { ClientRepo } from "./client-repo.js";
import { TemplateRepo } from "./template-repo.js";
import { SessionRepo } from "./session-repo.js";
import { TranscriptRepo } from "./transcript-repo.js";
import { NoteRepo } from "./note-repo.js";
import { AuditRepo } from "./audit-repo.js";

export * from "./base.js";
export * from "./types.js";
export {
  OrgRepo,
  UserRepo,
  ClientRepo,
  TemplateRepo,
  SessionRepo,
  TranscriptRepo,
  NoteRepo,
  AuditRepo,
};

/** The full set of tenant-scoped repositories, sharing one dependency bundle. */
export interface Repositories {
  orgs: OrgRepo;
  users: UserRepo;
  clients: ClientRepo;
  templates: TemplateRepo;
  sessions: SessionRepo;
  transcripts: TranscriptRepo;
  notes: NoteRepo;
  audit: AuditRepo;
  deps: RepoDeps;
}

export interface CreateRepositoriesOptions {
  /** Override individual deps (clock/ids/encryptor) — used by tests + seeds. */
  clock?: RepoDeps["clock"];
  ids?: RepoDeps["ids"];
  encryptor?: Encryptor;
  /** Passphrase for the default static encryptor (typically `config.ENCRYPTION_KEY`). */
  encryptionKey?: string;
}

/**
 * Build the repository set for a database connection. Defaults to the system
 * clock, UUID ids, and a static-key encryptor derived from `encryptionKey`.
 * Tests pass a `FixedClock`/`fixedIdGen`/mock encryptor for determinism.
 */
export function createRepositories(
  db: Database,
  opts: CreateRepositoriesOptions = {},
): Repositories {
  const encryptor =
    opts.encryptor ?? createEncryptor(staticKeyProvider(opts.encryptionKey ?? requireKey()));
  const deps: RepoDeps = {
    clock: opts.clock ?? systemClock,
    ids: opts.ids ?? uuidIdGen,
    encryptor,
  };
  return {
    orgs: new OrgRepo(db, deps),
    users: new UserRepo(db, deps),
    clients: new ClientRepo(db, deps),
    templates: new TemplateRepo(db, deps),
    sessions: new SessionRepo(db, deps),
    transcripts: new TranscriptRepo(db, deps),
    notes: new NoteRepo(db, deps),
    audit: new AuditRepo(db, deps),
    deps,
  };
}

function requireKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "createRepositories: provide `encryptionKey`/`encryptor` or set ENCRYPTION_KEY",
    );
  }
  return key;
}
