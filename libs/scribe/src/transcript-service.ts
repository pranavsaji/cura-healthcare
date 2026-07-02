import { systemClock, uuidIdGen, type Clock, type IdGen } from "@cura/core";
import type { AuditLog } from "@cura/audit";
import type { Store } from "@cura/db";
import type { AsrProvider, AsrOptions } from "@cura/transcription";
import type { Session, TranscriptSegment } from "@cura/shared";
import type { SessionService } from "./session-service.js";
import { recordingKey, type ObjectStore, type PresignedUpload } from "./storage/index.js";

/**
 * Transcript assembly + storage. Handles the three capture inputs' persistence
 * concerns: live segments are appended one-by-one (by the capture service); the
 * **upload** path stores the encrypted audio blob and runs the ASR **batch**
 * re-pass to produce the transcript; the batch re-pass can also refine a live
 * session's transcript after it ends. Audio is PHI → encrypted at rest and every
 * write is audited.
 */
export interface TranscriptServiceDeps {
  asr: AsrProvider;
  objectStore: ObjectStore;
  sessions: SessionService;
  audit: AuditLog;
  clock?: Clock;
  ids?: IdGen;
  /** Org retention window (days) → recording expiry. Default 3650 (10y). */
  retentionDays?: number;
}

export interface UploadResult {
  storageKey: string;
  retentionExpiresAt: string;
  segments: TranscriptSegment[];
}

export class TranscriptService {
  private readonly clock: Clock;
  private readonly ids: IdGen;
  private readonly retentionDays: number;

  constructor(private readonly deps: TranscriptServiceDeps) {
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? uuidIdGen;
    this.retentionDays = deps.retentionDays ?? 3650;
  }

  appendSegment(store: Store, sessionId: string, seg: TranscriptSegment): Promise<void> {
    return store.appendSegment(sessionId, seg);
  }

  getTranscript(store: Store, sessionId: string): Promise<TranscriptSegment[]> {
    return store.getTranscript(sessionId);
  }

  /** Presign a direct upload for the "upload audio" path (consent required). */
  async presignUpload(
    store: Store,
    sessionId: string,
    opts?: { contentType?: string; ext?: string },
  ): Promise<PresignedUpload & { retentionExpiresAt: string }> {
    await this.deps.sessions.assertConsent(store, sessionId);
    const key = this.keyFor(store, sessionId, opts?.ext);
    const presigned = await this.deps.objectStore.presignUpload(key, { ...(opts?.contentType ? { contentType: opts.contentType } : {}) });
    return { ...presigned, retentionExpiresAt: this.retentionExpiresAt() };
  }

  /**
   * Ingest an uploaded audio buffer: store it (encrypted), run the batch re-pass,
   * persist the transcript, and advance the session to `ready`. Consent is
   * enforced first; storage + transcript writes are audited.
   */
  async ingestUpload(
    store: Store,
    sessionId: string,
    audio: Buffer,
    options: AsrOptions & { contentType?: string; ext?: string } = {},
  ): Promise<UploadResult> {
    const session = await this.deps.sessions.assertConsent(store, sessionId);

    // 1) Store the encrypted audio blob.
    const key = this.keyFor(store, sessionId, options.ext);
    await this.deps.objectStore.put(key, audio, options.contentType ? { contentType: options.contentType } : {});
    const retentionExpiresAt = this.retentionExpiresAt();
    await this.audit(store, "recording.uploaded", sessionId, true, {
      storageKey: key,
      bytes: audio.byteLength,
      retentionExpiresAt,
    });

    // 2) Move to transcribing (created → transcribing for uploads).
    await store.updateSession(sessionId, { status: "transcribing", endedAt: this.clock.nowIso() });

    // 3) Batch re-pass → transcript.
    const asrOptions = dictationOptions(session, options);
    const segments = await this.deps.asr.transcribeBatch(audio, asrOptions);
    await store.replaceTranscript(sessionId, segments);
    await this.audit(store, "transcript.created", sessionId, true, { segments: segments.length, source: "batch" });

    // 4) Ready for note generation.
    await this.deps.sessions.markReady(store, sessionId);
    return { storageKey: key, retentionExpiresAt, segments };
  }

  /**
   * High-accuracy re-pass for a live session that has ended: re-transcribe the
   * stored audio and replace the streamed transcript with the batch result.
   */
  async rePass(store: Store, sessionId: string, audio: Buffer, options: AsrOptions = {}): Promise<TranscriptSegment[]> {
    const session = await this.deps.sessions.require(store, sessionId);
    const segments = await this.deps.asr.transcribeBatch(audio, dictationOptions(session, options));
    await store.replaceTranscript(sessionId, segments);
    await this.audit(store, "transcript.created", sessionId, true, { segments: segments.length, source: "re-pass" });
    await this.deps.sessions.markReady(store, sessionId);
    return segments;
  }

  private keyFor(store: Store, sessionId: string, ext?: string): string {
    return recordingKey({ orgId: store.orgId, sessionId, recordingId: this.ids.next(), ...(ext ? { ext } : {}) });
  }

  private retentionExpiresAt(): string {
    const base = new Date(this.clock.nowIso()).getTime();
    return new Date(base + this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
  }

  private audit(
    store: Store,
    action: Parameters<AuditLog["record"]>[0]["action"],
    sessionId: string,
    phiTouched: boolean,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    return this.deps.audit.record({
      orgId: store.orgId,
      actor: store.userId,
      action,
      resource: `session:${sessionId}`,
      phiTouched,
      context,
    });
  }
}

/** Dictation sessions are single-speaker → pin the ASR speaker to the clinician. */
function dictationOptions(session: Session, options: AsrOptions): AsrOptions {
  if (session.source === "dictation") return { ...options, fixedSpeaker: "clinician" };
  return options;
}
