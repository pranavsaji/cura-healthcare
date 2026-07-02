import { type Clock, systemClock } from "@cura/core";
import { isErr } from "@cura/shared";
import { FallbackConnector } from "./adapters/fallback.js";
import { idempotencyKey } from "./idempotency.js";
import type { AuditSink, EhrSyncJob, JobStore } from "./stores.js";
import type {
  ClientQuery,
  EhrClientRef,
  EhrConnector,
  EhrCredentials,
  EhrNoteInput,
  EhrNoteRef,
  SyncError,
} from "./types.js";

/**
 * The durable Super-Fill workflow: authenticate → findClient → createNote →
 * attachToEncounter, run with **idempotency, retries + backoff, and a dead-letter
 * → fallback** path (Phase 13 mandate). It is engine-agnostic — the same
 * function runs inline in a test, in a BullMQ worker, or as a Temporal activity;
 * durability comes from persisting step checkpoints on the {@link EhrSyncJob} so
 * a retry *resumes* rather than repeating completed steps. That checkpointing is
 * exactly what guarantees a retried sync never creates a duplicate note.
 */

export interface EhrSyncRequest {
  orgId: string;
  noteId: string;
  vendor: string;
  creds: EhrCredentials;
  clientQuery: ClientQuery;
  note: EhrNoteInput;
}

export interface RetryConfig {
  /** Max attempts of the whole step-chain. Default 3. */
  attempts?: number;
  baseMs?: number;
  factor?: number;
  maxDelayMs?: number;
}

export interface EhrSyncDeps {
  connector: EhrConnector;
  jobStore: JobStore;
  audit?: AuditSink;
  /** Terminal-failure fallback (assisted paste). Defaults to {@link FallbackConnector}. */
  fallback?: EhrConnector;
  clock?: Clock;
  retry?: RetryConfig;
  /** Injectable sleep for deterministic tests. Default: real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Progress updates streamed to the editor (Phase 07 hub). */
  onStatus?: (update: SyncStatusUpdate) => void;
}

export interface SyncStatusUpdate {
  jobId: string;
  status: "running" | "retrying" | "succeeded" | "failed" | "dead_letter";
  attempt: number;
  vendor: string;
  error?: SyncError;
}

export interface EhrSyncOutcome {
  status: "succeeded" | "dead_letter";
  jobId: string;
  vendor: string;
  externalNoteId: string | null;
  usedFallback: boolean;
  /** Formatted copy to paste when the real sync was not possible. */
  fallbackText?: string;
  error?: SyncError;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Backoff for a given attempt (1-based), exponential, clamped. */
function backoffMs(attempt: number, cfg: Required<RetryConfig>): number {
  return Math.min(cfg.maxDelayMs, cfg.baseMs * Math.pow(cfg.factor, attempt - 1));
}

export async function runEhrSync(req: EhrSyncRequest, deps: EhrSyncDeps): Promise<EhrSyncOutcome> {
  const clock = deps.clock ?? systemClock;
  const sleep = deps.sleep ?? defaultSleep;
  const cfg: Required<RetryConfig> = {
    attempts: deps.retry?.attempts ?? 3,
    baseMs: deps.retry?.baseMs ?? 100,
    factor: deps.retry?.factor ?? 2,
    maxDelayMs: deps.retry?.maxDelayMs ?? 2000,
  };
  const key = idempotencyKey({ orgId: req.orgId, noteId: req.noteId, vendor: req.vendor });

  // Idempotency: a completed job for this logical write is returned as-is — we
  // never create a second note for a re-enqueued/duplicate request.
  const existing = await deps.jobStore.byIdempotencyKey(req.orgId, key);
  if (existing?.status === "succeeded") {
    return {
      status: "succeeded",
      jobId: existing.id,
      vendor: existing.vendor,
      externalNoteId: existing.externalNoteId,
      usedFallback: existing.usedFallback,
    };
  }

  let job =
    existing ?? (await deps.jobStore.create({ orgId: req.orgId, noteId: req.noteId, vendor: req.vendor, idempotencyKey: key }));
  job = await deps.jobStore.update(req.orgId, job.id, { status: "running" });

  let lastError: SyncError | undefined;

  for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
    await audit(deps, req, job, "note.sync.attempted", { attempt });
    deps.onStatus?.({ jobId: job.id, status: "running", attempt, vendor: req.vendor });
    job = await deps.jobStore.update(req.orgId, job.id, { attempts: attempt });

    const attemptResult = await runSteps(req, deps, job, clock);
    job = attemptResult.job;

    if (!attemptResult.error) {
      job = await deps.jobStore.update(req.orgId, job.id, { status: "succeeded" });
      await audit(deps, req, job, "note.sync.succeeded", { attempt });
      deps.onStatus?.({ jobId: job.id, status: "succeeded", attempt, vendor: req.vendor });
      return {
        status: "succeeded",
        jobId: job.id,
        vendor: req.vendor,
        externalNoteId: job.externalNoteId,
        usedFallback: false,
      };
    }

    lastError = attemptResult.error;
    job = await deps.jobStore.update(req.orgId, job.id, { lastError: attemptResult.error });
    await audit(deps, req, job, "note.sync.failed", { attempt, errorKind: attemptResult.error.kind });

    const canRetry = attemptResult.error.retryable && attempt < cfg.attempts;
    if (!canRetry) break;
    deps.onStatus?.({ jobId: job.id, status: "retrying", attempt, vendor: req.vendor, error: attemptResult.error });
    await sleep(backoffMs(attempt, cfg));
  }

  // Terminal failure → degrade to the always-available formatted-copy fallback.
  return degradeToFallback(req, deps, job, lastError);
}

interface StepOutcome {
  job: EhrSyncJob;
  error?: SyncError;
}

/**
 * Run the sync steps, resuming from persisted checkpoints. `createNote` is
 * skipped once an `externalNoteId` is recorded, so it executes at most once
 * across all attempts — the no-duplicate-note guarantee.
 */
async function runSteps(req: EhrSyncRequest, deps: EhrSyncDeps, jobIn: EhrSyncJob, _clock: Clock): Promise<StepOutcome> {
  let job = jobIn;
  const { connector, creds } = { connector: deps.connector, creds: req.creds };

  const auth = await connector.authenticate(creds);
  if (isErr(auth)) return { job, error: auth.error };

  // findClient (checkpoint: externalClientId)
  let client: EhrClientRef;
  if (job.externalClientId) {
    client = { externalId: job.externalClientId, label: req.clientQuery.label };
  } else {
    const found = await connector.findClient(creds, req.clientQuery);
    if (isErr(found)) return { job, error: found.error };
    client = found.value;
    job = await deps.jobStore.update(req.orgId, job.id, { externalClientId: client.externalId });
  }

  // createNote (checkpoint: externalNoteId) — runs at most once.
  let noteRef: EhrNoteRef;
  if (job.externalNoteId) {
    noteRef = { externalId: job.externalNoteId };
  } else {
    const created = await connector.createNote(creds, client, req.note, job.idempotencyKey);
    if (isErr(created)) return { job, error: created.error };
    noteRef = created.value;
    job = await deps.jobStore.update(req.orgId, job.id, { externalNoteId: noteRef.externalId });
  }

  // attachToEncounter (best-effort per capability)
  if (connector.capabilities.attachEncounter) {
    const attached = await connector.attachToEncounter(creds, noteRef, client);
    if (isErr(attached)) return { job, error: attached.error };
  }

  return { job };
}

async function degradeToFallback(
  req: EhrSyncRequest,
  deps: EhrSyncDeps,
  jobIn: EhrSyncJob,
  error: SyncError | undefined,
): Promise<EhrSyncOutcome> {
  const fallback = deps.fallback ?? new FallbackConnector();
  const key = jobIn.idempotencyKey;
  // The fallback never fails; produce the paste-ready copy and dead-letter the job.
  const client = { externalId: req.clientQuery.clientId ?? `label:${req.clientQuery.label}`, label: req.clientQuery.label };
  const copyRef = await fallback.createNote(req.creds, client, req.note, key);
  const fallbackText = FallbackConnector.formattedCopy(req.note);

  const job = await deps.jobStore.update(req.orgId, jobIn.id, {
    status: "dead_letter",
    usedFallback: true,
    ...(copyRef.ok ? { externalNoteId: copyRef.value.externalId } : {}),
  });
  await audit(deps, req, job, "note.sync.dead_letter", { errorKind: error?.kind ?? "unknown" });
  deps.onStatus?.({ jobId: job.id, status: "dead_letter", attempt: job.attempts, vendor: req.vendor, ...(error ? { error } : {}) });

  return {
    status: "dead_letter",
    jobId: job.id,
    vendor: req.vendor,
    externalNoteId: job.externalNoteId,
    usedFallback: true,
    fallbackText,
    ...(error ? { error } : {}),
  };
}

async function audit(
  deps: EhrSyncDeps,
  req: EhrSyncRequest,
  job: EhrSyncJob,
  action: "note.sync.attempted" | "note.sync.succeeded" | "note.sync.failed" | "note.sync.dead_letter",
  context: Record<string, unknown>,
): Promise<void> {
  if (!deps.audit) return;
  // Context is metadata only — never PHI (CONVENTIONS §6).
  await deps.audit.record({
    orgId: req.orgId,
    actor: "system",
    action,
    resource: `note:${req.noteId}`,
    phiTouched: false,
    context: { jobId: job.id, vendor: req.vendor, ...context },
  });
}
