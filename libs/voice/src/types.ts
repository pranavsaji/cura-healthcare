import type { AudioFrame } from "@cura/telephony";

/**
 * The low-latency voice pipeline contracts. STT and TTS sit behind interfaces
 * (reuse `@cura/transcription` for real STT; a real TTS vendor for synthesis),
 * with mocks for deterministic tests. The pipeline turns caller audio → text →
 * an agent reply → audio, with **endpointing** (utterance boundaries) and
 * **barge-in** (caller interrupts the agent). Target: first agent audio < 2s.
 */

/** Streaming speech-to-text over a caller utterance's frames. */
export interface SpeechToText {
  readonly name: string;
  /** Transcribe one completed utterance (the frames since the last boundary). */
  transcribe(frames: AudioFrame[]): Promise<string>;
}

/** Text-to-speech that yields outbound frames and can be cancelled (barge-in). */
export interface TextToSpeech {
  readonly name: string;
  /** Chunk `text` into the frames that will be streamed to the caller. */
  synthesize(text: string): AudioFrame[];
}

/** How the pipeline produces a reply for a transcribed caller utterance. */
export type Responder = (utterance: string) => Promise<string>;

export interface PipelineMetrics {
  /** ms from call answered to the FIRST outbound agent frame (the SLO metric). */
  firstResponseMs?: number;
  /** Count of times the caller interrupted the agent mid-speech. */
  bargeIns: number;
  /** Utterances the agent spoke. */
  agentUtterances: number;
}
