import type { AudioFrame } from "@cura/telephony";
import type { SpeechToText, TextToSpeech } from "./types.js";

/**
 * Deterministic STT/TTS mocks for offline dev/tests. The mock STT concatenates
 * frame payloads (the mock telephony sends text as `data`); the mock TTS chunks
 * a reply into word-frames so the pipeline exercises real streaming + barge-in
 * without any audio codec or network.
 */
export class MockStt implements SpeechToText {
  readonly name = "mock";
  async transcribe(frames: AudioFrame[]): Promise<string> {
    return frames
      .map((f) => f.data)
      .join(" ")
      .trim();
  }
}

export class MockTts implements TextToSpeech {
  readonly name = "mock";
  synthesize(text: string): AudioFrame[] {
    const words = text.split(/\s+/).filter(Boolean);
    // At least one frame even for empty text, so "spoke" is observable.
    if (words.length === 0) return [{ seq: 0, data: "" }];
    return words.map((w, i) => ({ seq: i, data: w }));
  }
}
