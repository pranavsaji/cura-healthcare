import { ok } from "@cura/shared";
import type {
  ClientQuery,
  EhrCapabilities,
  EhrClientRef,
  EhrConnector,
  EhrCredentials,
  EhrNoteInput,
  EhrNoteRef,
  EhrResult,
  SyncStatus,
} from "../types.js";

/**
 * The always-available connector: it never calls out and never fails. When no
 * vendor API exists (or a real sync permanently fails), the note is turned into
 * a formatted, sign-off-ready copy the clinician pastes into their EHR — so the
 * clinician is *never blocked* (Phase 13 mandate). Deterministic: the external
 * id is derived from the idempotency key, so a "retry" returns the same ref.
 */
export class FallbackConnector implements EhrConnector {
  readonly vendor = "fallback";
  readonly capabilities: EhrCapabilities = {
    findClient: true,
    createNote: true,
    attachEncounter: false,
    realtimeStatus: false,
  };

  /** The formatted text produced for the last/most-relevant note (assisted paste). */
  static formattedCopy(note: EhrNoteInput): string {
    return `${note.format} NOTE — ${note.clientLabel}\n\n${note.text.trim()}\n`;
  }

  async authenticate(_creds: EhrCredentials): Promise<EhrResult<void>> {
    return ok(undefined);
  }

  async findClient(_creds: EhrCredentials, query: ClientQuery): Promise<EhrResult<EhrClientRef>> {
    return ok({ externalId: query.clientId ?? `label:${query.label}`, label: query.label });
  }

  async createNote(
    _creds: EhrCredentials,
    _client: EhrClientRef,
    _note: EhrNoteInput,
    idempotencyKey: string,
  ): Promise<EhrResult<EhrNoteRef>> {
    // A stable, offline "reference" so the workflow records a successful copy.
    return ok({ externalId: `copy:${idempotencyKey}`, url: undefined });
  }

  async attachToEncounter(): Promise<EhrResult<void>> {
    return ok(undefined);
  }

  async status(): Promise<EhrResult<SyncStatus>> {
    return ok("accepted");
  }
}
