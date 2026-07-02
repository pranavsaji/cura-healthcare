import { randomUUID } from "node:crypto";

/**
 * Id generation abstraction. Injected everywhere so tests get deterministic ids
 * (`fixedIdGen`) while prod gets UUIDv4. Structurally matches `@cura/testing`.
 */
export interface IdGen {
  /** A fresh unique id, optionally namespaced with a short prefix. */
  next(prefix?: string): string;
}

/** Production id generator: `prefix_<uuid>` (or bare uuid when no prefix). */
export const uuidIdGen: IdGen = {
  next: (prefix?: string) => (prefix ? `${prefix}_${randomUUID()}` : randomUUID()),
};

/**
 * Deterministic, monotonic id generator for tests/seeds. Ids are stable across
 * runs so fixtures and golden files don't churn.
 */
export function fixedIdGen(defaultPrefix = "id"): IdGen {
  let n = 0;
  return {
    next(prefix?: string) {
      n += 1;
      return `${prefix ?? defaultPrefix}_${n}`;
    },
  };
}
