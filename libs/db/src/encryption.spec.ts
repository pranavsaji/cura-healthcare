import { describe, it, expect } from "vitest";
import { createEncryptor, staticKeyProvider } from "./encryption.js";

const enc = createEncryptor(staticKeyProvider("test-encryption-key-1234567890"));

describe("createEncryptor (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const ct = enc.encrypt("S. Mitchell · 32F");
    expect(ct).not.toContain("Mitchell");
    expect(enc.decrypt(ct)).toBe("S. Mitchell · 32F");
  });

  it("produces a fresh IV each call (non-deterministic ciphertext)", () => {
    expect(enc.encrypt("same")).not.toBe(enc.encrypt("same"));
  });

  it("marks its own ciphertext and rejects foreign values", () => {
    expect(enc.isEncrypted(enc.encrypt("x"))).toBe(true);
    expect(enc.isEncrypted("plaintext")).toBe(false);
    expect(() => enc.decrypt("plaintext")).toThrow();
  });

  it("detects tampering via the GCM auth tag", () => {
    const ct = enc.encrypt("MRN-1001");
    const [v, iv, tag, body] = ct.split(".");
    const flippedBody = body!.slice(0, -2) + (body!.endsWith("A") ? "BB" : "AA");
    expect(() => enc.decrypt([v, iv, tag, flippedBody].join("."))).toThrow();
  });

  it("fails to decrypt under a different key", () => {
    const other = createEncryptor(staticKeyProvider("a-totally-different-key-000000"));
    expect(() => other.decrypt(enc.encrypt("secret"))).toThrow();
  });

  it("handles nullable helpers", () => {
    expect(enc.encryptNullable(null)).toBeNull();
    expect(enc.decryptNullable(null)).toBeNull();
    expect(enc.decryptNullable(enc.encryptNullable("v"))).toBe("v");
  });

  it("rejects weak passphrases", () => {
    expect(() => staticKeyProvider("short")).toThrow(/at least 16/);
  });
});
