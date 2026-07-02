/**
 * Deterministic id generator for tests. Satisfies the structural `IdGen`
 * interface (`next(): string`) that `@cura/core` defines in Phase 04.
 */
export interface IdGen {
  next(): string;
}

export function fixedIdGen(prefix = "id"): IdGen {
  let n = 0;
  return {
    next() {
      n += 1;
      return `${prefix}_${n}`;
    },
  };
}
