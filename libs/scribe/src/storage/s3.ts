import { ProviderError, NotFoundError } from "@cura/shared";
import { presignUrl, signRequest, type AwsCredentials } from "./sigv4.js";
import type { ObjectStore, PresignOptions, PresignedUpload, PutOptions, PutResult } from "./object-store.js";

/**
 * S3-backed object store with SSE-KMS encryption at rest. No AWS SDK — requests
 * are signed with our own SigV4 (`sigv4.ts`) and sent via `fetch`. Presigned
 * uploads let the client PUT audio directly to S3 (the API never proxies PHI
 * bytes). Only used when `STORAGE_PROVIDER=s3`; dev/CI use memory/local.
 */
export interface S3Config {
  bucket: string;
  region: string;
  credentials: AwsCredentials;
  /** KMS key id for SSE-KMS (required for PHI at rest). */
  kmsKeyId?: string;
  /** Override endpoint host (e.g. MinIO). Defaults to the AWS virtual-host URL. */
  endpointHost?: string;
  /** Injectable clock for deterministic signing in tests. */
  now?: () => Date;
}

export class S3ObjectStore implements ObjectStore {
  readonly kind = "s3" as const;
  private readonly host: string;
  private readonly now: () => Date;

  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.host = config.endpointHost ?? `${config.bucket}.s3.${config.region}.amazonaws.com`;
    this.now = config.now ?? (() => new Date());
  }

  private sseHeaders(): Record<string, string> {
    if (!this.config.kmsKeyId) return {};
    return {
      "x-amz-server-side-encryption": "aws:kms",
      "x-amz-server-side-encryption-aws-kms-key-id": this.config.kmsKeyId,
    };
  }

  async put(key: string, body: Buffer, opts?: PutOptions): Promise<PutResult> {
    const headers = signRequest({
      method: "PUT",
      host: this.host,
      region: this.config.region,
      key,
      credentials: this.config.credentials,
      payload: body,
      extraHeaders: {
        ...(opts?.contentType ? { "content-type": opts.contentType } : {}),
        ...this.sseHeaders(),
      },
      now: this.now(),
    });
    const res = await this.fetchImpl(`https://${this.host}/${encodeKey(key)}`, {
      method: "PUT",
      headers,
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new ProviderError(`S3 put failed (${res.status})`);
    return { key, size: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    const headers = signRequest({
      method: "GET",
      host: this.host,
      region: this.config.region,
      key,
      credentials: this.config.credentials,
      payload: Buffer.alloc(0),
      now: this.now(),
    });
    const res = await this.fetchImpl(`https://${this.host}/${encodeKey(key)}`, { method: "GET", headers });
    if (res.status === 404) throw new NotFoundError("object");
    if (!res.ok) throw new ProviderError(`S3 get failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    const headers = signRequest({
      method: "GET",
      host: this.host,
      region: this.config.region,
      key,
      credentials: this.config.credentials,
      payload: Buffer.alloc(0),
      now: this.now(),
    });
    const res = await this.fetchImpl(`https://${this.host}/${encodeKey(key)}`, { method: "GET", headers });
    return res.ok;
  }

  async presignUpload(key: string, opts?: PresignOptions): Promise<PresignedUpload> {
    const expiresSec = opts?.expiresSec ?? 900;
    const url = presignUrl({
      method: "PUT",
      host: this.host,
      region: this.config.region,
      key,
      credentials: this.config.credentials,
      expiresSec,
      now: this.now(),
    });
    return {
      method: "PUT",
      url,
      // SSE + content-type are enforced as request headers the client must send.
      headers: { ...(opts?.contentType ? { "content-type": opts.contentType } : {}), ...this.sseHeaders() },
      key,
      expiresAt: new Date(this.now().getTime() + expiresSec * 1000).toISOString(),
    };
  }

  async delete(key: string): Promise<void> {
    const headers = signRequest({
      method: "DELETE",
      host: this.host,
      region: this.config.region,
      key,
      credentials: this.config.credentials,
      payload: Buffer.alloc(0),
      now: this.now(),
    });
    const res = await this.fetchImpl(`https://${this.host}/${encodeKey(key)}`, { method: "DELETE", headers });
    if (!res.ok && res.status !== 404) throw new ProviderError(`S3 delete failed (${res.status})`);
  }
}

/** Encode a key for the request path, preserving `/` separators. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}
