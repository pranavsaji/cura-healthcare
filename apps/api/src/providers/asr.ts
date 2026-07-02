import type { TranscriptSegment } from "@cura/shared";
import { env } from "../env.js";

/**
 * Streaming ASR provider abstraction. The mock lets the whole capture→transcript
 * loop work offline (driven by "simulate" WS messages). Real providers
 * (Deepgram / AssemblyAI) implement the same push/close contract.
 */
export interface AsrStream {
  /** Feed raw audio bytes (PCM16). */
  pushAudio(chunk: Buffer): void;
  /** Feed a text line directly (dev/mock + dictation fallback). */
  pushText(text: string, speaker?: "clinician" | "client"): void;
  close(): void;
}

export interface AsrCallbacks {
  onPartial: (text: string, speaker: TranscriptSegment["speaker"]) => void;
  onSegment: (seg: TranscriptSegment) => void;
}

class MockAsrStream implements AsrStream {
  private t = 0;
  constructor(private cb: AsrCallbacks) {}

  pushAudio(_chunk: Buffer): void {
    // A real provider would transcribe audio here. The mock ignores raw audio
    // and relies on pushText() so the pipeline is demoable without a mic/key.
  }

  pushText(text: string, speaker: "clinician" | "client" = "client"): void {
    // Emit a quick "partial" then a finalized segment with timing + confidence.
    this.cb.onPartial(text, speaker);
    const words = Math.max(1, text.split(/\s+/).length);
    const start = this.t;
    const end = this.t + words * 0.4; // ~0.4s/word
    this.t = end + 0.3;
    this.cb.onSegment({
      speaker,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      text: text.trim(),
      confidence: 0.9,
    });
  }

  close(): void {}
}

export function createAsrStream(cb: AsrCallbacks): AsrStream {
  switch (env.asrProvider) {
    case "deepgram":
    case "assemblyai":
      // TODO: wire the real streaming SDK (BAA required). Falls back to mock
      // until an API key is present so dev never breaks.
      return new MockAsrStream(cb);
    default:
      return new MockAsrStream(cb);
  }
}
