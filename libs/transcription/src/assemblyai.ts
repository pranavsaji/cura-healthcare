import { withRetry } from "@cura/core";
import { ProviderError } from "@cura/shared";
import type { TranscriptSegment } from "@cura/shared";
import { DiarizationMapper } from "./diarization.js";
import { buildVocabulary } from "./vocabulary.js";
import type { AsrCallbacks, AsrOptions, AsrProvider, AsrStream } from "./types.js";

/**
 * AssemblyAI provider. Batch uses the upload → transcript → poll REST flow with
 * speaker labels + word boost; streaming uses the realtime WebSocket (temp-token
 * auth) which is not diarized, so streamed segments take `fixedSpeaker` or fall
 * back to `client`. Same `TranscriptSegment` output as every other provider.
 *
 * Runs only when `ASSEMBLYAI_API_KEY` is set; otherwise the factory uses the
 * mock, so no key/network is required for dev or CI.
 */

const BASE = "https://api.assemblyai.com/v2";
const REALTIME_WS = "wss://api.assemblyai.com/v2/realtime/ws";

interface AaiUtterance {
  speaker?: string;
  start: number; // ms
  end: number; // ms
  text: string;
  confidence?: number;
}
interface AaiTranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  text?: string;
  confidence?: number;
  utterances?: AaiUtterance[];
}
interface AaiStreamMessage {
  message_type?: "PartialTranscript" | "FinalTranscript" | "SessionBegins" | string;
  text?: string;
  audio_start?: number; // ms
  audio_end?: number; // ms
  confidence?: number;
}

class AssemblyAiStream implements AsrStream {
  private ws: WebSocket | null = null;
  private open = false;
  private closed = false;
  private readonly pending: Buffer[] = [];
  private readonly diarizer: DiarizationMapper;
  private closePromise: Promise<void> | null = null;

  constructor(
    apiKey: string,
    private readonly cb: AsrCallbacks,
    options: AsrOptions,
  ) {
    // Realtime is single-channel (no diarization); attribute to the fixed role
    // (dictation) or `client` by default.
    this.diarizer = new DiarizationMapper(options.fixedSpeaker ?? "client");
    void this.connect(apiKey, options).catch((err) =>
      this.cb.onError?.(new ProviderError("AssemblyAI connect failed", { cause: err })),
    );
  }

  private async connect(apiKey: string, options: AsrOptions): Promise<void> {
    const token = await fetchTempToken(apiKey);
    const sampleRate = options.sampleRate ?? 16000;
    const ws = new WebSocket(`${REALTIME_WS}?sample_rate=${sampleRate}&token=${token}`);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      for (const chunk of this.pending) this.sendAudio(chunk);
      this.pending.length = 0;
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onerror = () => this.cb.onError?.(new ProviderError("AssemblyAI stream error"));
  }

  pushAudio(chunk: Buffer): void {
    if (this.closed) return;
    if (this.open) this.sendAudio(chunk);
    else this.pending.push(chunk);
  }

  pushText(text: string, speaker?: AsrOptions["fixedSpeaker"]): void {
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
        ws.send(JSON.stringify({ terminate_session: true }));
      } catch {
        /* already closed */
      }
      try {
        ws.close();
      } catch {
        done();
      }
      setTimeout(done, 2000);
    });
    return this.closePromise;
  }

  private sendAudio(chunk: Buffer): void {
    try {
      this.ws?.send(JSON.stringify({ audio_data: chunk.toString("base64") }));
    } catch (err) {
      this.cb.onError?.(new ProviderError("AssemblyAI send failed", { cause: err }));
    }
  }

  private handleMessage(data: unknown): void {
    let msg: AaiStreamMessage;
    try {
      msg = JSON.parse(typeof data === "string" ? data : Buffer.from(data as ArrayBuffer).toString("utf8"));
    } catch {
      return;
    }
    if (!msg.text) return;
    const role = this.diarizer.map("client");
    if (msg.message_type === "FinalTranscript") {
      this.cb.onSegment({
        speaker: role,
        start: round2((msg.audio_start ?? 0) / 1000),
        end: round2((msg.audio_end ?? 0) / 1000),
        text: msg.text.trim(),
        confidence: clamp01(msg.confidence ?? 1),
      });
    } else if (msg.message_type === "PartialTranscript") {
      this.cb.onPartial(msg.text, role);
    }
  }
}

export class AssemblyAiProvider implements AsrProvider {
  readonly name = "assemblyai";

  constructor(private readonly apiKey: string) {}

  openStream(callbacks: AsrCallbacks, options: AsrOptions = {}): AsrStream {
    return new AssemblyAiStream(this.apiKey, callbacks, options);
  }

  async transcribeBatch(audio: Buffer, options: AsrOptions = {}): Promise<TranscriptSegment[]> {
    const uploadUrl = await this.upload(audio);
    const id = await this.requestTranscript(uploadUrl, options);
    const transcript = await this.poll(id);
    return mapUtterances(transcript, options);
  }

  private async upload(audio: Buffer): Promise<string> {
    const res = await withRetry(
      () =>
        fetch(`${BASE}/upload`, {
          method: "POST",
          headers: { authorization: this.apiKey, "content-type": "application/octet-stream" },
          body: new Uint8Array(audio),
        }),
      { retryable: (e) => e instanceof Error },
    );
    if (!res.ok) throw new ProviderError(`AssemblyAI upload failed (${res.status})`);
    const body = (await res.json()) as { upload_url: string };
    return body.upload_url;
  }

  private async requestTranscript(audioUrl: string, options: AsrOptions): Promise<string> {
    const res = await fetch(`${BASE}/transcript`, {
      method: "POST",
      headers: { authorization: this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: options.diarize !== false,
        word_boost: buildVocabulary(options.vocabulary),
        boost_param: "high",
        language_code: options.language ?? "en_us",
      }),
    });
    if (!res.ok) throw new ProviderError(`AssemblyAI transcript request failed (${res.status})`);
    const body = (await res.json()) as AaiTranscript;
    return body.id;
  }

  private async poll(id: string, maxAttempts = 60): Promise<AaiTranscript> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(`${BASE}/transcript/${id}`, {
        headers: { authorization: this.apiKey },
      });
      if (!res.ok) throw new ProviderError(`AssemblyAI poll failed (${res.status})`);
      const body = (await res.json()) as AaiTranscript;
      if (body.status === "completed") return body;
      if (body.status === "error") throw new ProviderError(`AssemblyAI error: ${body.error ?? "unknown"}`);
      await sleep(1000);
    }
    throw new ProviderError("AssemblyAI transcription timed out");
  }
}

async function fetchTempToken(apiKey: string): Promise<string> {
  const res = await fetch(`${BASE}/realtime/token`, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ expires_in: 3600 }),
  });
  if (!res.ok) throw new ProviderError(`AssemblyAI token failed (${res.status})`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

function mapUtterances(transcript: AaiTranscript, options: AsrOptions): TranscriptSegment[] {
  const diarizer = new DiarizationMapper(options.fixedSpeaker);
  const utterances = transcript.utterances ?? [];
  if (utterances.length > 0) {
    return utterances
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((u) => ({
        speaker: diarizer.map(u.speaker ?? "unknown"),
        start: round2(u.start / 1000),
        end: round2(u.end / 1000),
        text: u.text.trim(),
        confidence: clamp01(u.confidence ?? 1),
      }));
  }
  if (!transcript.text) return [];
  return [
    {
      speaker: "unknown",
      start: 0,
      end: 0,
      text: transcript.text.trim(),
      confidence: clamp01(transcript.confidence ?? 1),
    },
  ];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Number(n.toFixed(2));
}
