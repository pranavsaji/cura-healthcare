import { MemoryObjectStore, type ObjectStore } from "./object-store.js";
import { LocalObjectStore } from "./local.js";
import { S3ObjectStore, type S3Config } from "./s3.js";

export * from "./object-store.js";
export * from "./local.js";
export * from "./s3.js";
export * from "./sigv4.js";

/** Config selecting an {@link ObjectStore} implementation. */
export type ObjectStoreConfig =
  | { provider: "memory" }
  | { provider: "local"; root: string }
  | ({ provider: "s3" } & S3Config);

/**
 * Build the object store from config (CONVENTIONS §2). Defaults to memory. S3
 * requires bucket/region/credentials/kmsKeyId; missing pieces fail fast rather
 * than silently storing PHI unencrypted.
 */
export function createObjectStore(config: ObjectStoreConfig = { provider: "memory" }): ObjectStore {
  switch (config.provider) {
    case "local":
      return new LocalObjectStore(config.root);
    case "s3": {
      if (!config.kmsKeyId) throw new Error("S3 object store requires kmsKeyId for SSE-KMS (PHI at rest)");
      return new S3ObjectStore(config);
    }
    case "memory":
    default:
      return new MemoryObjectStore();
  }
}
