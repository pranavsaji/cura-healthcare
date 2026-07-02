import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Application-layer envelope encryption for PII/PHI columns (CONVENTIONS §6):
 * `clients.display_label`, `clients.mrn`, etc. are ciphertext at rest and only
 * decrypted through a repository. The data-encryption key is provided by a
 * pluggable {@link KeyProvider} (mock/static in dev; KMS in prod) so we can
 * rotate to a real KMS without touching repositories.
 */

/** Supplies the 32-byte data key. Real impls fetch/unwrap from KMS. */
export interface KeyProvider {
  /** Return the active 32-byte AES key. */
  dataKey(): Buffer;
}

/**
 * Dev/test key provider: derive a stable 32-byte key from a passphrase
 * (`config.ENCRYPTION_KEY`). NOT for production KMS use, but deterministic and
 * dependency-free for offline dev + tests.
 */
export function staticKeyProvider(passphrase: string): KeyProvider {
  if (!passphrase || passphrase.length < 16) {
    throw new Error("ENCRYPTION_KEY must be at least 16 characters");
  }
  const key = createHash("sha256").update(passphrase, "utf8").digest(); // 32 bytes
  return { dataKey: () => key };
}

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
/** Version/format tag so ciphertext is self-describing and rotation-safe. */
const VERSION = "v1";

export interface Encryptor {
  /** Encrypt UTF-8 plaintext → opaque, self-describing string. */
  encrypt(plaintext: string): string;
  /** Decrypt a string produced by {@link encrypt}. Throws if tampered. */
  decrypt(ciphertext: string): string;
  /** Encrypt only when value is present (nullable PII columns). */
  encryptNullable(plaintext: string | null | undefined): string | null;
  /** Decrypt only when value is present. */
  decryptNullable(ciphertext: string | null | undefined): string | null;
  /** True if the string looks like our ciphertext (idempotent read paths). */
  isEncrypted(value: string): boolean;
}

/**
 * AES-256-GCM encryptor. Output format: `v1.<iv>.<authTag>.<ciphertext>` with
 * each part base64url. GCM gives us authenticated encryption, so any tampering
 * (including with the IV or tag) fails `decrypt`.
 */
export function createEncryptor(keys: KeyProvider): Encryptor {
  const enc = (plaintext: string): string => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, keys.dataKey(), iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ct.toString("base64url"),
    ].join(".");
  };

  const isEncrypted = (value: string): boolean =>
    typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;

  const dec = (ciphertext: string): string => {
    if (!isEncrypted(ciphertext)) {
      throw new Error("Value is not in the expected ciphertext format");
    }
    const [, ivB64, tagB64, ctB64] = ciphertext.split(".");
    const decipher = createDecipheriv(ALGO, keys.dataKey(), Buffer.from(ivB64!, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  };

  return {
    encrypt: enc,
    decrypt: dec,
    encryptNullable: (v) => (v == null ? null : enc(v)),
    decryptNullable: (v) => (v == null ? null : dec(v)),
    isEncrypted,
  };
}
