import type { Speaker } from "./types.js";

/**
 * Speaker normalization. Providers label speakers with opaque tokens — Deepgram
 * emits integer indices (0, 1, 2…), AssemblyAI emits letters ("A", "B"). The
 * platform speaks in ROLES: `clinician | client | unknown`. This module maps
 * provider labels to roles deterministically and consistently within a session.
 *
 * Heuristic: in a therapy encounter the clinician almost always speaks first
 * (greeting / orienting the client), so the FIRST distinct speaker seen is
 * mapped to `clinician`, the SECOND to `client`, and any further speakers to
 * `unknown`. The mapping is stable for the life of one stream/mapper instance.
 */

/** Explicit role words a provider (or the mock) may already emit. */
const EXPLICIT: Record<string, Speaker> = {
  clinician: "clinician",
  therapist: "clinician",
  provider: "clinician",
  doctor: "clinician",
  client: "client",
  patient: "client",
  unknown: "unknown",
};

/**
 * Normalize a raw provider label to a role, given a running assignment map.
 * Prefer {@link DiarizationMapper} for stream use; this pure helper backs it and
 * is handy for one-off/batch mapping.
 */
export function normalizeSpeaker(
  raw: string | number | null | undefined,
  assignment: Map<string, Speaker>,
): Speaker {
  if (raw === null || raw === undefined) return "unknown";
  const key = String(raw).trim().toLowerCase();
  if (key === "") return "unknown";

  const explicit = EXPLICIT[key];
  if (explicit) return explicit;

  const existing = assignment.get(key);
  if (existing) return existing;

  // First unseen label → clinician, second → client, rest → unknown.
  const assignedRoles = new Set(assignment.values());
  let role: Speaker;
  if (!assignedRoles.has("clinician")) role = "clinician";
  else if (!assignedRoles.has("client")) role = "client";
  else role = "unknown";
  assignment.set(key, role);
  return role;
}

/**
 * Stateful mapper for one streaming session. Give it whatever the provider hands
 * you (an int, a letter, a role word) and it returns a stable normalized role.
 */
export class DiarizationMapper {
  private readonly assignment = new Map<string, Speaker>();

  /** Force `fixedSpeaker` for dictation-style single-speaker capture. */
  constructor(private readonly fixed?: Speaker) {}

  map(raw: string | number | null | undefined): Speaker {
    if (this.fixed) return this.fixed;
    return normalizeSpeaker(raw, this.assignment);
  }

  /** Current label→role assignments (diagnostics / tests). */
  snapshot(): Record<string, Speaker> {
    return Object.fromEntries(this.assignment);
  }
}
