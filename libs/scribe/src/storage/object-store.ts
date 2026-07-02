import { NotFoundError } from "@cura/shared";

/**
 * Encrypted object storage behind one interface (CONVENTIONS §2). Audio/PHI blobs
 * are written here; the DB only holds the `storageKey`. Three implementations:
 * S3 (SSE-KMS, prod), local-disk (dev), in-memory (test). Every key is namespaced
 * by `orgId` so tenants are isolated at the storage layer too.
 */
export interface PutOptions {
  contentType?: string;
}

export interface PutResult {
  key: string;
  size: number;
}

/** A presigned direct-to-storage upload; the client PUTs bytes to `url`. */
export interface PresignedUpload {
  method: "PUT";
  url: string;
  /** Headers the client must send with the PUT (e.g. content-type, SSE). */
  headers: Record<string, string>;
  key: string;
  expiresAt: string;
}

export interface PresignOptions {
  contentType?: string;
  expiresSec?: number;
}

export interface ObjectStore {
  readonly kind: "memory" | "local" | "s3";
  put(key: string, body: Buffer, opts?: PutOptions): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  presignUpload(key: string, opts?: PresignOptions): Promise<PresignedUpload>;
  delete(key: string): Promise<void>;
}

/**
 * Build a tenant-namespaced object key. Layout:
 *   `orgs/{orgId}/sessions/{sessionId}/recordings/{recordingId}.{ext}`
 * Keeping org first makes prefix-scoped lifecycle/retention rules trivial.
 */
export function recordingKey(parts: {
  orgId: string;
  sessionId: string;
  recordingId: string;
  ext?: string;
}): string {
  const ext = (parts.ext ?? "audio").replace(/^\./, "");
  return `orgs/${parts.orgId}/sessions/${parts.sessionId}/recordings/${parts.recordingId}.${ext}`;
}

/** Guard: every key must be org-namespaced (defense against a missing scope). */
export function assertOrgScoped(key: string, orgId: string): void {
  if (!key.startsWith(`orgs/${orgId}/`)) {
    throw new Error(`storage key "${key}" is not scoped to org ${orgId}`);
  }
}

/** In-memory store for tests — no disk, no network. */
export class MemoryObjectStore implements ObjectStore {
  readonly kind = "memory" as const;
  private readonly blobs = new Map<string, Buffer>();

  async put(key: string, body: Buffer, _opts?: PutOptions): Promise<PutResult> {
    this.blobs.set(key, Buffer.from(body));
    return { key, size: body.byteLength };
  }
  async get(key: string): Promise<Buffer> {
    const blob = this.blobs.get(key);
    if (!blob) throw new NotFoundError("object");
    return blob;
  }
  async exists(key: string): Promise<boolean> {
    return this.blobs.has(key);
  }
  async presignUpload(key: string, opts?: PresignOptions): Promise<PresignedUpload> {
    // No real endpoint in-memory; return a sentinel URL the dev API resolves by
    // POSTing bytes back to its own ingest route.
    return {
      method: "PUT",
      url: `memory://${key}`,
      headers: opts?.contentType ? { "content-type": opts.contentType } : {},
      key,
      expiresAt: new Date(Date.now() + (opts?.expiresSec ?? 900) * 1000).toISOString(),
    };
  }
  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}
