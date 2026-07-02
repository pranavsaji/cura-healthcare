import type { TranscriptSegment } from "@cura/shared";

/**
 * The one interface every ASR backend implements. Apps and services depend on
 * this — never on Deepgram/AssemblyAI SDKs directly (CONVENTIONS §2). A provider
 * offers a streaming path (live capture / dictation) and a batch path (the
 * high-accuracy re-pass used by note-gen after a session ends).
 */

/** Normalized speaker roles used across the platform. */
export type Speaker = TranscriptSegment["speaker"]; // "clinician" | "client" | "unknown"

export interface AsrCallbacks {
  /** Interim (non-final) hypothesis — may be revised before a segment lands. */
  onPartial: (text: string, speaker: Speaker) => void;
  /** A finalized {@link TranscriptSegment} (immutable, evidence-grade). */
  onSegment: (segment: TranscriptSegment) => void;
  /** Transport/provider failure. Streaming errors are surfaced, never thrown. */
  onError?: (error: Error) => void;
}

/**
 * Provider-agnostic capture options. Vocabulary + diarization are inputs here
 * so the same call site works for any backend (mock/deepgram/assemblyai).
 */
export interface AsrOptions {
  /** Domain terms to boost recognition of (medical / behavioral-health). */
  vocabulary?: string[];
  /** Ask the provider to diarize (label speakers). Default true. */
  diarize?: boolean;
  /** PCM sample rate for raw-audio streams. Default 16000. */
  sampleRate?: number;
  /** BCP-47 language tag. Default "en". */
  language?: string;
  /**
   * Single-speaker mode (dictation): every segment is attributed to this role
   * regardless of provider diarization. Skips speaker mapping entirely.
   */
  fixedSpeaker?: Speaker;
}

/** A live capture stream. `close()` flushes and releases the transport. */
export interface AsrStream {
  /** Feed raw audio bytes (PCM16 by default). */
  pushAudio(chunk: Buffer): void;
  /** Feed a text line directly (mock / dictation fallback / tests). */
  pushText(text: string, speaker?: Speaker): void;
  /** Flush pending audio, finalize, and release the transport. */
  close(): Promise<void>;
}

/**
 * A speech-to-text backend. `openStream` starts a live session; `transcribeBatch`
 * runs the high-accuracy re-pass over a stored file. Both emit the SAME shape
 * (`TranscriptSegment` from `@cura/shared`) — guaranteed by the contract test.
 */
export interface AsrProvider {
  /** Stable provider id, e.g. "mock" | "deepgram" | "assemblyai". */
  readonly name: string;
  /** Open a streaming session; callbacks receive partials + finalized segments. */
  openStream(callbacks: AsrCallbacks, options?: AsrOptions): AsrStream;
  /** High-accuracy batch transcription of a complete audio buffer. */
  transcribeBatch(audio: Buffer, options?: AsrOptions): Promise<TranscriptSegment[]>;
}

/** Selection + credentials for {@link createAsrProvider}. */
export interface AsrConfig {
  provider: "mock" | "deepgram" | "assemblyai";
  apiKey?: string | undefined;
  /** Provider model/tier (e.g. Deepgram "nova-2-medical"). */
  model?: string | undefined;
  /** Extra vocabulary merged into the built-in medical/BH term list. */
  vocabulary?: string[] | undefined;
}
