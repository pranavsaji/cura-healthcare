import { withRetry } from "@cura/core";
import { ProviderError } from "@cura/shared";
import type { TranscriptSegment } from "@cura/shared";
import { DiarizationMapper } from "./diarization.js";
import { buildVocabulary, toDeepgramKeywords } from "./vocabulary.js";
import type { AsrCallbacks, AsrOptions, AsrProvider, AsrStream } from "./types.js";

/**
 * Deepgram provider. Streaming over the realtime WebSocket API; batch over the
 * pre-recorded REST API. Auth uses the WS subprotocol (`["token", key]`) so it
 * works with Node's global `WebSocket` (no custom headers, no vendor SDK). Both
 * paths normalize speaker labels and emit `TranscriptSegment`.
 *
 * This code only runs when `DEEPGRAM_API_KEY` is configured; the factory falls
 * back to the mock otherwise, so dev/CI never require a key or network.
 */

const STREAM_URL = "wss://api.deepgram.com/v1/listen";
const BATCH_URL = "https://api.deepgram.com/v1/listen";

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: number;
}
interface DeepgramAlternative {
  transcript: string;
  confidence?: number;
  words?: DeepgramWord[];
}
interface DeepgramStreamMessage {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: DeepgramAlternative[] };
}
interface DeepgramUtterance {
  speaker?: number;
  start: number;
  end: number;
  transcript: string;
  confidence?: number;
}
interface DeepgramBatchResponse {
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: { alternatives?: DeepgramAlternative[] }[];
  };
}

class DeepgramStream implements AsrStream {
  private ws: WebSocket | null = null;
  private open = false;
  private closed = false;
  private readonly pending: Buffer[] = [];
  private readonly diarizer: DiarizationMapper;
  private closePromise: Promise<void> | null = null;

  constructor(
    apiKey: string,
    model: string,
    private readonly cb: AsrCallbacks,
    private readonly options: AsrOptions,
  ) {
    this.diarizer = new DiarizationMapper(options.diarize === false ? "unknown" : options.fixedSpeaker);
    const url = buildStreamUrl(model, options);
    try {
      // Deepgram accepts the API key as the second WS subprotocol token.
      this.ws = new WebSocket(url, ["token", apiKey]);
      this.ws.binaryType = "arraybuffer";
      this.ws.onopen = () => {
        this.open = true;
        for (const chunk of this.pending) this.sendAudio(chunk);
        this.pending.length = 0;
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
      this.ws.onerror = () => this.cb.onError?.(new ProviderError("Deepgram stream error"));
    } catch (err) {
      this.cb.onError?.(new ProviderError("Deepgram connect failed", { cause: err }));
    }
  }

  pushAudio(chunk: Buffer): void {
    if (this.closed) return;
    if (this.open && this.ws) this.sendAudio(chunk);
    else this.pending.push(chunk);
  }

  pushText(text: string, speaker?: AsrOptions["fixedSpeaker"]): void {
    // Deepgram transcribes audio; a directly-injected text line is emitted as a
    // finalized segment so dictation/dev fallbacks still produce a transcript.
    const clean = text.trim();
    if (!clean) return;
    const role = this.diarizer.map(speaker ?? "client");
    this.cb.onPartial(clean, role);
    this.cb.onSegment({ speaker: role, start: 0, end: 0, text: clean, confidence: 1 });
  }

  async close(): Promise<void> {
    if (this.closed) return this.closePromise ?? Promise.resolve();
    this.closed = true;
    const ws = this.ws;
    if (!ws) return;
    this.closePromise = new Promise<void>((resolve) => {
      const done = () => resolve();
      ws.onclose = done;
      try {
        // Ask Deepgram to flush and finalize before the socket tears down.
        ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        /* socket already gone */
      }
      try {
        ws.close();
      } catch {
        done();
      }
      // Safety net so callers never hang if the close event is missed.
      setTimeout(done, 2000);
    });
    return this.closePromise;
  }

  private sendAudio(chunk: Buffer): void {
    try {
      this.ws?.send(chunk);
    } catch (err) {
      this.cb.onError?.(new ProviderError("Deepgram send failed", { cause: err }));
    }
  }

  private handleMessage(data: unknown): void {
    let msg: DeepgramStreamMessage;
    try {
      msg = JSON.parse(typeof data === "string" ? data : Buffer.from(data as ArrayBuffer).toString("utf8"));
    } catch {
      return;
    }
    const alt = msg.channel?.alternatives?.[0];
    if (!alt || !alt.transcript) return;
    const role = this.diarizer.map(alt.words?.[0]?.speaker ?? "client");
    if (msg.is_final) {
      this.cb.onSegment(segmentFromWords(alt, role));
    } else {
      this.cb.onPartial(alt.transcript, role);
    }
  }
}

export class DeepgramProvider implements AsrProvider {
  readonly name = "deepgram";

  constructor(
    private readonly apiKey: string,
    private readonly model = "nova-2-medical",
  ) {}

  openStream(callbacks: AsrCallbacks, options: AsrOptions = {}): AsrStream {
    return new DeepgramStream(this.apiKey, this.model, callbacks, options);
  }

  async transcribeBatch(audio: Buffer, options: AsrOptions = {}): Promise<TranscriptSegment[]> {
    const url = buildBatchUrl(this.model, options);
    const res = await withRetry(
      () =>
        fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Token ${this.apiKey}`,
            "Content-Type": "application/octet-stream",
          },
          body: new Uint8Array(audio),
        }),
      { retryable: isTransient },
    );
    if (!res.ok) {
      throw new ProviderError(`Deepgram batch failed (${res.status})`);
    }
    const body = (await res.json()) as DeepgramBatchResponse;
    return mapBatchResponse(body, options);
  }
}

// ── URL builders ─────────────────────────────────────────────────────

function commonParams(model: string, options: AsrOptions): URLSearchParams {
  const params = new URLSearchParams({
    model,
    punctuate: "true",
    smart_format: "true",
    language: options.language ?? "en",
  });
  if (options.diarize !== false) params.set("diarize", "true");
  for (const kw of toDeepgramKeywords(buildVocabulary(options.vocabulary))) {
    params.append("keywords", kw);
  }
  return params;
}

function buildStreamUrl(model: string, options: AsrOptions): string {
  const params = commonParams(model, options);
  params.set("interim_results", "true");
  params.set("encoding", "linear16");
  params.set("sample_rate", String(options.sampleRate ?? 16000));
  return `${STREAM_URL}?${params.toString()}`;
}

function buildBatchUrl(model: string, options: AsrOptions): string {
  const params = commonParams(model, options);
  params.set("utterances", "true"); // one segment per utterance in the response
  return `${BATCH_URL}?${params.toString()}`;
}

// ── Response mapping ─────────────────────────────────────────────────

function segmentFromWords(alt: DeepgramAlternative, role: TranscriptSegment["speaker"]): TranscriptSegment {
  const words = alt.words ?? [];
  const start = words[0]?.start ?? 0;
  const end = words[words.length - 1]?.end ?? start;
  const confidence = clamp01(
    alt.confidence ?? avg(words.map((w) => w.confidence ?? 1)) ?? 1,
  );
  return { speaker: role, start: round2(start), end: round2(end), text: alt.transcript.trim(), confidence };
}

function mapBatchResponse(body: DeepgramBatchResponse, options: AsrOptions): TranscriptSegment[] {
  const diarizer = new DiarizationMapper(options.fixedSpeaker);
  const utterances = body.results?.utterances ?? [];
  if (utterances.length > 0) {
    return utterances
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((u) => ({
        speaker: diarizer.map(u.speaker ?? "unknown"),
        start: round2(u.start),
        end: round2(u.end),
        text: u.transcript.trim(),
        confidence: clamp01(u.confidence ?? 1),
      }));
  }
  // Fallback: no utterances — collapse the primary alternative into one segment.
  const alt = body.results?.channels?.[0]?.alternatives?.[0];
  if (!alt?.transcript) return [];
  return [segmentFromWords(alt, "unknown")];
}

function isTransient(err: unknown): boolean {
  // Network/timeout errors are transient; a thrown TypeError from fetch counts.
  return err instanceof Error;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function avg(nums: number[]): number | undefined {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
}
function round2(n: number): number {
  return Number(n.toFixed(2));
}
