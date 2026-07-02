import { mkdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { NotFoundError } from "@cura/shared";
import type { ObjectStore, PresignOptions, PresignedUpload, PutOptions, PutResult } from "./object-store.js";

/**
 * Local-disk object store for dev. Files live under a root dir, mirroring the
 * object key path. Keys are validated so they can never escape the root (no
 * `..` traversal). Presign returns a `file://`-style URL; the dev API ingests
 * bytes through its own upload route rather than a real signed endpoint.
 */
export class LocalObjectStore implements ObjectStore {
  readonly kind = "local" as const;

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Reject any traversal outright — object keys are always org-namespaced and
    // must never contain `..`.
    if (key.split(/[\\/]/).includes("..")) throw new Error(`unsafe storage key: ${key}`);
    const full = join(this.root, normalize(key));
    if (!full.startsWith(normalize(this.root) + sep) && full !== normalize(this.root)) {
      throw new Error(`unsafe storage key: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer, _opts?: PutOptions): Promise<PutResult> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, size: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      throw new NotFoundError("object");
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async presignUpload(key: string, opts?: PresignOptions): Promise<PresignedUpload> {
    return {
      method: "PUT",
      url: `file://${this.resolve(key)}`,
      headers: opts?.contentType ? { "content-type": opts.contentType } : {},
      key,
      expiresAt: new Date(Date.now() + (opts?.expiresSec ?? 900) * 1000).toISOString(),
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      /* already gone — idempotent delete */
    }
  }
}
