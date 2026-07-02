import type { Result } from "@cura/shared";

/**
 * The EHR integration contract. One `EhrConnector` interface, many adapters —
 * real API, partner API, structured export, or assisted-paste fallback — all
 * satisfying the same shape + contract test (Phase 13 mandate). Expected
 * failures are returned as typed {@link SyncError} inside a {@link Result};
 * connectors NEVER throw for an expected failure (CONVENTIONS §3), so the
 * durable workflow can decide retry vs. dead-letter deterministically.
 */

/** Why a sync step failed, and whether retrying could help. */
export type SyncErrorKind =
  | "auth" // bad/expired credentials — not retryable
  | "not_found" // client/encounter not found — not retryable
  | "validation" // payload rejected — not retryable
  | "conflict" // duplicate/idempotency conflict — treated as success upstream
  | "unsupported" // vendor can't do this operation — not retryable
  | "rate_limited" // back off and retry
  | "unavailable" // network/5xx — retry
  | "timeout"; // step exceeded its deadline — retry

export interface SyncError {
  kind: SyncErrorKind;
  message: string;
  /** True when a later attempt might succeed (transient). */
  retryable: boolean;
  /** Optional upstream status/code for observability (never PHI). */
  status?: number;
}

export type EhrResult<T> = Result<T, SyncError>;

/** Per-org, per-vendor credentials. `secrets` is encrypted at rest (Phase 03/04). */
export interface EhrCredentials {
  orgId: string;
  vendor: string;
  secrets: Record<string, string>;
}

/** Search key for matching the note's client to an EHR chart. */
export interface ClientQuery {
  label: string;
  clientId?: string | null;
  mrn?: string | null;
}

export interface EhrClientRef {
  externalId: string;
  label: string;
}

/** The note payload to write back. `text` is the rendered, sign-off-ready note. */
export interface EhrNoteInput {
  clientLabel: string;
  clientId?: string | null;
  format: string;
  text: string;
}

export interface EhrNoteRef {
  externalId: string;
  /** Deep link into the EHR, when the vendor exposes one. */
  url?: string;
}

export type SyncStatus = "pending" | "accepted" | "rejected";

/** What a given adapter can actually do (varies wildly across vendors). */
export interface EhrCapabilities {
  findClient: boolean;
  createNote: boolean;
  attachEncounter: boolean;
  realtimeStatus: boolean;
}

/**
 * A vendor adapter. Every method returns a {@link EhrResult}; `createNote` takes
 * an `idempotencyKey` so a retried write never creates a duplicate note.
 */
export interface EhrConnector {
  readonly vendor: string;
  readonly capabilities: EhrCapabilities;
  authenticate(creds: EhrCredentials): Promise<EhrResult<void>>;
  findClient(creds: EhrCredentials, query: ClientQuery): Promise<EhrResult<EhrClientRef>>;
  createNote(
    creds: EhrCredentials,
    client: EhrClientRef,
    note: EhrNoteInput,
    idempotencyKey: string,
  ): Promise<EhrResult<EhrNoteRef>>;
  attachToEncounter(
    creds: EhrCredentials,
    note: EhrNoteRef,
    client: EhrClientRef,
  ): Promise<EhrResult<void>>;
  status(creds: EhrCredentials, note: EhrNoteRef): Promise<EhrResult<SyncStatus>>;
}

/** Helper to build a typed error result concisely. */
export function syncError(
  kind: SyncErrorKind,
  message: string,
  extra?: { retryable?: boolean; status?: number },
): SyncError {
  const retryableDefault = kind === "rate_limited" || kind === "unavailable" || kind === "timeout";
  return {
    kind,
    message,
    retryable: extra?.retryable ?? retryableDefault,
    ...(extra?.status !== undefined ? { status: extra.status } : {}),
  };
}
