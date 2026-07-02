import { err, ok } from "@cura/shared";
import {
  type ClientQuery,
  type EhrCapabilities,
  type EhrClientRef,
  type EhrConnector,
  type EhrCredentials,
  type EhrNoteInput,
  type EhrNoteRef,
  type EhrResult,
  type SyncStatus,
  syncError,
} from "../types.js";

/**
 * The first *deep* adapter (SimplePractice-shaped). We go deep on one vendor
 * first (Phase 13 mandate). The HTTP layer is injected as {@link HttpClient} so
 * the adapter is unit-testable with scripted responses and carries no vendor
 * SDK (CONVENTIONS §2 — no app/lib imports a vendor SDK directly). Every HTTP
 * failure is mapped to a typed {@link SyncError}; nothing throws for an expected
 * failure. Idempotency is enforced by forwarding the key as a header, so the
 * server dedupes a retried createNote.
 */

export interface HttpRequest {
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

const BASE_CAPS: EhrCapabilities = {
  findClient: true,
  createNote: true,
  attachEncounter: true,
  realtimeStatus: true,
};

/** Map a transport/HTTP status to the typed error taxonomy. */
function mapHttpError(status: number, message: string): ReturnType<typeof syncError> {
  if (status === 401 || status === 403) return syncError("auth", message, { status, retryable: false });
  if (status === 404) return syncError("not_found", message, { status, retryable: false });
  if (status === 409) return syncError("conflict", message, { status, retryable: false });
  if (status === 422 || status === 400) return syncError("validation", message, { status, retryable: false });
  if (status === 429) return syncError("rate_limited", message, { status });
  if (status === 0) return syncError("unavailable", message, { status }); // network error convention
  if (status >= 500) return syncError("unavailable", message, { status });
  return syncError("validation", message, { status, retryable: false });
}

export class SimplePracticeConnector implements EhrConnector {
  readonly vendor = "simplepractice";
  readonly capabilities = BASE_CAPS;

  constructor(private readonly http: HttpClient) {}

  private authHeaders(creds: EhrCredentials): Record<string, string> {
    const token = creds.secrets.accessToken ?? creds.secrets.apiKey ?? "";
    return { Authorization: `Bearer ${token}` };
  }

  async authenticate(creds: EhrCredentials): Promise<EhrResult<void>> {
    if (!creds.secrets.accessToken && !creds.secrets.apiKey) {
      return err(syncError("auth", "missing credentials", { retryable: false }));
    }
    const res = await this.http.request({ method: "GET", path: "/v1/me", headers: this.authHeaders(creds) });
    if (res.status >= 200 && res.status < 300) return ok(undefined);
    return err(mapHttpError(res.status, "authentication failed"));
  }

  async findClient(creds: EhrCredentials, query: ClientQuery): Promise<EhrResult<EhrClientRef>> {
    const res = await this.http.request({
      method: "GET",
      path: "/v1/clients",
      headers: this.authHeaders(creds),
      query: { q: query.mrn ?? query.label },
    });
    if (res.status < 200 || res.status >= 300) return err(mapHttpError(res.status, "client lookup failed"));
    const first = (res.body as { data?: { id: string; name: string }[] }).data?.[0];
    if (!first) return err(syncError("not_found", "no matching client", { retryable: false }));
    return ok({ externalId: first.id, label: first.name });
  }

  async createNote(
    creds: EhrCredentials,
    client: EhrClientRef,
    note: EhrNoteInput,
    idempotencyKey: string,
  ): Promise<EhrResult<EhrNoteRef>> {
    const res = await this.http.request({
      method: "POST",
      path: `/v1/clients/${client.externalId}/notes`,
      headers: { ...this.authHeaders(creds), "Idempotency-Key": idempotencyKey },
      body: { format: note.format, content: note.text },
    });
    // A 409 means the server already recorded this idempotency key: treat the
    // referenced note as the successful result — NOT a duplicate, NOT an error.
    if (res.status === 409) {
      const existing = (res.body as { id?: string }).id;
      if (existing) return ok({ externalId: existing });
    }
    if (res.status < 200 || res.status >= 300) return err(mapHttpError(res.status, "note create failed"));
    const created = res.body as { id: string; url?: string };
    return ok({ externalId: created.id, ...(created.url ? { url: created.url } : {}) });
  }

  async attachToEncounter(
    creds: EhrCredentials,
    note: EhrNoteRef,
    client: EhrClientRef,
  ): Promise<EhrResult<void>> {
    const res = await this.http.request({
      method: "POST",
      path: `/v1/notes/${note.externalId}/attach`,
      headers: this.authHeaders(creds),
      body: { clientId: client.externalId },
    });
    if (res.status >= 200 && res.status < 300) return ok(undefined);
    return err(mapHttpError(res.status, "attach failed"));
  }

  async status(creds: EhrCredentials, note: EhrNoteRef): Promise<EhrResult<SyncStatus>> {
    const res = await this.http.request({
      method: "GET",
      path: `/v1/notes/${note.externalId}`,
      headers: this.authHeaders(creds),
    });
    if (res.status < 200 || res.status >= 300) return err(mapHttpError(res.status, "status failed"));
    const s = (res.body as { status?: string }).status;
    const mapped: SyncStatus = s === "accepted" || s === "rejected" ? s : "pending";
    return ok(mapped);
  }
}
