import { type Clock, type IdGen, systemClock, uuidIdGen } from "@cura/core";
import type { AuditInput } from "@cura/shared";
import type { SyncError } from "./types.js";

/**
 * Persistence contracts for durable sync. Defined structurally (like
 * `@cura/audit`'s `AuditStore`) so the workflow is fully unit-testable in-memory
 * with no database — the Postgres-backed `ehr_sync_jobs` repo satisfies the same
 * shape (handoff TODO). Every method is org-scoped: a query for org A can never
 * see org B's jobs (tenant isolation by construction, CONVENTIONS §2).
 */

export type EhrSyncJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_letter";

export interface EhrSyncJob {
  id: string;
  orgId: string;
  noteId: string;
  vendor: string;
  idempotencyKey: string;
  status: EhrSyncJobStatus;
  attempts: number;
  /** Progress checkpoints so a retry resumes instead of redoing completed steps. */
  externalClientId: string | null;
  externalNoteId: string | null;
  lastError: SyncError | null;
  usedFallback: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobInput {
  orgId: string;
  noteId: string;
  vendor: string;
  idempotencyKey: string;
}

export type JobPatch = Partial<
  Pick<EhrSyncJob, "status" | "attempts" | "externalClientId" | "externalNoteId" | "lastError" | "usedFallback">
>;

export interface JobStore {
  create(input: CreateJobInput): Promise<EhrSyncJob>;
  get(orgId: string, id: string): Promise<EhrSyncJob | null>;
  byIdempotencyKey(orgId: string, key: string): Promise<EhrSyncJob | null>;
  update(orgId: string, id: string, patch: JobPatch): Promise<EhrSyncJob>;
  list(orgId: string): Promise<EhrSyncJob[]>;
}

/** Minimal audit surface the workflow needs — `@cura/audit`'s log satisfies it. */
export interface AuditSink {
  record(input: AuditInput): Promise<unknown>;
}

export interface InMemoryJobStoreDeps {
  clock?: Clock;
  ids?: IdGen;
}

/** In-memory {@link JobStore} for dev/tests. Org-scoped on every read. */
export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, EhrSyncJob>();
  private readonly clock: Clock;
  private readonly ids: IdGen;

  constructor(deps: InMemoryJobStoreDeps = {}) {
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? uuidIdGen;
  }

  async create(input: CreateJobInput): Promise<EhrSyncJob> {
    const now = this.clock.nowIso();
    const job: EhrSyncJob = {
      id: this.ids.next("ehrjob"),
      orgId: input.orgId,
      noteId: input.noteId,
      vendor: input.vendor,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      attempts: 0,
      externalClientId: null,
      externalNoteId: null,
      lastError: null,
      usedFallback: false,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return { ...job };
  }

  async get(orgId: string, id: string): Promise<EhrSyncJob | null> {
    const job = this.jobs.get(id);
    return job && job.orgId === orgId ? { ...job } : null;
  }

  async byIdempotencyKey(orgId: string, key: string): Promise<EhrSyncJob | null> {
    for (const job of this.jobs.values()) {
      if (job.orgId === orgId && job.idempotencyKey === key) return { ...job };
    }
    return null;
  }

  async update(orgId: string, id: string, patch: JobPatch): Promise<EhrSyncJob> {
    const job = this.jobs.get(id);
    if (!job || job.orgId !== orgId) throw new Error(`ehr_sync_job ${id} not found for org`);
    const next: EhrSyncJob = { ...job, ...patch, updatedAt: this.clock.nowIso() };
    this.jobs.set(id, next);
    return { ...next };
  }

  async list(orgId: string): Promise<EhrSyncJob[]> {
    return [...this.jobs.values()].filter((j) => j.orgId === orgId).map((j) => ({ ...j }));
  }
}
