import type { Store } from "@cura/db";
import type { AsrProvider, AsrOptions, AsrStream, Speaker } from "@cura/transcription";
import type { Session, TranscriptSegment } from "@cura/shared";
import type { SessionService } from "./session-service.js";
import type { TranscriptService } from "./transcript-service.js";

/**
 * Bridges the realtime transport (WS hub) to the ASR provider. It does NOT know
 * about WebSockets — the caller passes a {@link CapturePublisher} that fans
 * partials/segments out however it likes (in prod: Redis pub/sub via the hub).
 * Capture is **consent-gated**: `beginCapture` delegates to
 * {@link SessionService.startCapture}, which rejects (and audits) a start with no
 * consent. Finalized segments are persisted in order via the transcript service.
 */
export interface CapturePublisher {
  partial(text: string, speaker: Speaker): void | Promise<void>;
  segment(segment: TranscriptSegment): void | Promise<void>;
  error?(message: string): void | Promise<void>;
}

export interface CaptureHandle {
  pushAudio(chunk: Buffer): void;
  pushText(text: string, speaker?: Speaker): void;
  /** Resolve once all in-flight segment persistence has settled. */
  flush(): Promise<void>;
  /** Close the ASR stream, persist remaining segments, and stop the session. */
  stop(): Promise<Session>;
}

export interface CaptureServiceDeps {
  asr: AsrProvider;
  sessions: SessionService;
  transcripts: TranscriptService;
}

export class CaptureService {
  constructor(private readonly deps: CaptureServiceDeps) {}

  /**
   * Start capturing for a session. Enforces consent + the status machine before
   * any audio is accepted. Returns a handle to feed audio/text and to stop.
   */
  async beginCapture(
    store: Store,
    sessionId: string,
    publisher: CapturePublisher,
    options: AsrOptions = {},
  ): Promise<CaptureHandle> {
    // Consent gate + transition to `recording` + audit (throws if not consented).
    const session = await this.deps.sessions.startCapture(store, sessionId);

    // Serialize segment persistence so the stored transcript stays ordered even
    // though ASR callbacks fire synchronously.
    let tail: Promise<void> = Promise.resolve();
    const enqueue = (seg: TranscriptSegment): void => {
      tail = tail
        .then(() => this.deps.transcripts.appendSegment(store, sessionId, seg))
        .then(() => void publisher.segment(seg));
    };

    const asrOptions = session.source === "dictation" ? { ...options, fixedSpeaker: "clinician" as Speaker } : options;
    const stream: AsrStream = this.deps.asr.openStream(
      {
        onPartial: (text, speaker) => void publisher.partial(text, speaker),
        onSegment: (seg) => enqueue(seg),
        onError: (err) => void publisher.error?.(err.message),
      },
      asrOptions,
    );

    const flush = async (): Promise<void> => {
      await tail;
    };

    return {
      pushAudio: (chunk) => stream.pushAudio(chunk),
      pushText: (text, speaker) => stream.pushText(text, speaker),
      flush,
      stop: async () => {
        await stream.close();
        await flush();
        return this.deps.sessions.stopCapture(store, sessionId);
      },
    };
  }
}
