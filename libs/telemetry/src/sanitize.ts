import type { AttrValue, Attributes } from "./types.js";

/**
 * PHI-free enforcement for telemetry attributes. Telemetry is exported to
 * third-party backends (Grafana/Datadog) and indexed, so it must NEVER contain
 * PHI or secrets (CONVENTIONS §6). We DROP — not redact — any key that names a
 * PHI/secret field, and drop any non-primitive value (objects/arrays could smuggle
 * PHI). Only ids, durations, counts, statuses, and enums survive.
 */

/** Field names that carry PHI or secrets. Superset of the logger's redaction list. */
const BLOCKED_KEYS = new Set(
  [
    "content",
    "text",
    "transcript",
    "transcripts",
    "segments",
    "segment",
    "audio",
    "quote",
    "note",
    "notes",
    "sections",
    "section",
    "body",
    "message",
    "prompt",
    "completion",
    "clientlabel",
    "client_label",
    "displaylabel",
    "display_label",
    "name",
    "email",
    "phone",
    "address",
    "dob",
    "mrn",
    "ssn",
    "password",
    "token",
    "accesstoken",
    "access_token",
    "apikey",
    "api_key",
    "secret",
    "authorization",
    "cookie",
  ].map((k) => k.toLowerCase()),
);

/** True if a key names a PHI/secret field (case-insensitive, substring-aware). */
export function isPhiKey(key: string): boolean {
  const k = key.toLowerCase();
  if (BLOCKED_KEYS.has(k)) return true;
  // Substring guard: `patient_name`, `client.email`, `note_content`, etc.
  for (const blocked of BLOCKED_KEYS) {
    if (k.includes(blocked)) return true;
  }
  return false;
}

function isPrimitive(value: unknown): value is AttrValue {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}

export interface SanitizeResult {
  attributes: Attributes;
  /** Keys that were dropped (for tests + a dev warning). */
  dropped: string[];
}

/**
 * Return a copy of `attrs` with every PHI/secret key and every non-primitive
 * value removed. This is the single choke point all span/metric attributes flow
 * through, so PHI cannot reach an exporter even if a caller is careless.
 */
export function sanitizeAttributes(attrs: Attributes | undefined): SanitizeResult {
  const attributes: Attributes = {};
  const dropped: string[] = [];
  if (!attrs) return { attributes, dropped };
  for (const [key, value] of Object.entries(attrs)) {
    if (isPhiKey(key) || !isPrimitive(value)) {
      dropped.push(key);
      continue;
    }
    attributes[key] = value;
  }
  return { attributes, dropped };
}
