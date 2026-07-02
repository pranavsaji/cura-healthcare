import type { TranscriptSegment } from "@cura/shared";
import { DiarizationMapper } from "./diarization.js";
import type { AsrCallbacks, AsrOptions, AsrProvider, AsrStream, Speaker } from "./types.js";

/**
 * Offline ASR. Lets the whole capture → transcript → note loop run with zero
 * external services (driven by `pushText`/`simulate` in dev, or decoded text in
 * batch). It ignores raw audio (no model) but emits the exact same
 * {@link TranscriptSegment} shape as the real providers, so the contract test
 * holds and the mock is a safe default (CONVENTIONS §2).
 */
class MockAsrStream implements AsrStream {
  private cursor = 0; // running "playhead" in seconds
  private readonly diarizer: DiarizationMapper;

  constructor(
    private readonly cb: AsrCallbacks,
    options: AsrOptions,
  ) {
    this.diarizer = new DiarizationMapper(options.fixedSpeaker);
  }

  pushAudio(_chunk: Buffer): void {
    // No model — the mock relies on pushText so the pipeline is demoable without
    // a mic or an API key. Raw audio is intentionally a no-op.
  }

  pushText(text: string, speaker: Speaker = "client"): void {
    const clean = text.trim();
    if (!clean) return;
    const role = this.diarizer.map(speaker);
    this.cb.onPartial(clean, role);
    const seg = buildSegment(clean, role, this.cursor);
    this.cursor = seg.end + 0.3; // brief inter-utterance gap
    this.cb.onSegment(seg);
  }

  async close(): Promise<void> {
    // Nothing to flush for the mock.
  }
}

export class MockAsrProvider implements AsrProvider {
  readonly name = "mock";

  openStream(callbacks: AsrCallbacks, options: AsrOptions = {}): AsrStream {
    return new MockAsrStream(callbacks, options);
  }

  /**
   * Deterministic batch transcription. Interprets the buffer as UTF-8 text — one
   * utterance per line. A `role:` prefix (`clinician:` / `client:` / `A:`) sets
   * the speaker; otherwise speakers alternate starting with the clinician. This
   * makes the "upload audio" path testable offline: upload a text transcript and
   * get back well-formed, ordered, diarized segments.
   */
  async transcribeBatch(audio: Buffer, options: AsrOptions = {}): Promise<TranscriptSegment[]> {
    const lines = audio
      .toString("utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const diarizer = new DiarizationMapper(options.fixedSpeaker);
    const segments: TranscriptSegment[] = [];
    let cursor = 0;
    let alternate = 0;

    for (const line of lines) {
      const parsed = parseSpeakerPrefix(line);
      const rawSpeaker = parsed.speaker ?? (alternate % 2 === 0 ? "clinician" : "client");
      if (!parsed.speaker) alternate += 1;
      const role = diarizer.map(rawSpeaker);
      const seg = buildSegment(parsed.text, role, cursor);
      cursor = seg.end + 0.3;
      segments.push(seg);
    }
    return segments;
  }
}

/** Split an optional `speaker:` prefix off a line (`clinician: hello` → …). */
function parseSpeakerPrefix(line: string): { speaker?: string; text: string } {
  const m = /^([A-Za-z0-9 _-]{1,20}):\s*(.*)$/.exec(line);
  if (m && m[2] !== undefined && m[2].length > 0) {
    return { speaker: m[1]!.trim(), text: m[2] };
  }
  return { text: line };
}

/**
 * Build a finalized segment with plausible timing (~0.4s/word) and a fixed
 * confidence. Timings are monotonic given a running `start` cursor.
 */
export function buildSegment(text: string, speaker: Speaker, start: number): TranscriptSegment {
  const words = Math.max(1, text.split(/\s+/).filter(Boolean).length);
  const end = start + words * 0.4;
  return {
    speaker,
    start: round2(start),
    end: round2(end),
    text: text.trim(),
    confidence: 0.9,
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
