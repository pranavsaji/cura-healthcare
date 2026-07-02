/**
 * Typed feature flags. Risky/incomplete paths default OFF and are enabled via
 * the `FEATURE_FLAGS` env (comma-separated) or a runtime override (e.g. a DB
 * row per org in a later phase). Unknown flags are rejected at construction so a
 * typo can't silently disable a feature.
 */

/** The registry of known flags → default value. Extend as features land. */
export const FLAG_DEFAULTS = {
  "realtime.redis-fanout": false,
  "notes.risk-detection": true,
  "ehr.auto-sync": false,
  "audit.strict-verify": true,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;

export const FLAG_NAMES = Object.keys(FLAG_DEFAULTS) as FlagName[];

export interface Flags {
  /** Whether `name` is enabled, honoring per-call overrides then env then default. */
  isEnabled(name: FlagName, override?: boolean): boolean;
  /** Snapshot of every flag's effective value. */
  all(): Record<FlagName, boolean>;
}

/**
 * Build a Flags accessor from a comma-separated enabled-list (typically
 * `config.FEATURE_FLAGS`). A leading `!` disables an otherwise-default-on flag.
 * Throws on an unknown flag name so misconfiguration fails fast.
 */
export function createFlags(enabledList = ""): Flags {
  const state: Record<FlagName, boolean> = { ...FLAG_DEFAULTS };
  const tokens = enabledList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const disable = token.startsWith("!");
    const name = (disable ? token.slice(1) : token) as FlagName;
    if (!(name in FLAG_DEFAULTS)) {
      throw new Error(`Unknown feature flag "${name}". Known flags: ${FLAG_NAMES.join(", ")}`);
    }
    state[name] = !disable;
  }

  return {
    isEnabled: (name, override) => override ?? state[name],
    all: () => ({ ...state }),
  };
}
