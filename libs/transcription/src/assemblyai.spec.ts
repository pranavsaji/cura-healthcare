import { describe, it, expect, vi, afterEach } from "vitest";
import { AssemblyAiProvider } from "./assemblyai.js";

/**
 * Offline tests for the AssemblyAI provider. The batch path is a 3-step REST
 * flow (upload → request → poll); `fetch` is stubbed to walk it deterministically
 * and assert the utterance→segment mapping (ms→seconds, speaker labels).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AssemblyAiProvider — batch", () => {
  it("uploads, requests with word_boost + speaker labels, polls, and maps utterances", async () => {
    const fetchMock = vi
      .fn((_url: unknown, _init?: unknown) => Promise.resolve({ ok: true, json: async () => ({}) }))
      // 1) upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ upload_url: "https://cdn/aud" }) })
      // 2) create transcript
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1", status: "queued" }) })
      // 3) poll → processing then completed
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1", status: "processing" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "t1",
          status: "completed",
          utterances: [
            { speaker: "A", start: 0, end: 1500, text: "Hello.", confidence: 0.97 },
            { speaker: "B", start: 1600, end: 3000, text: "Hi there.", confidence: 0.9 },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AssemblyAiProvider("aai-key");
    const segs = await provider.transcribeBatch(Buffer.from("audio"), { vocabulary: ["EMDR"] });

    // Upload was keyed.
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/v2/upload");
    // Transcript request carried speaker labels + boost.
    const createBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(createBody.speaker_labels).toBe(true);
    expect(createBody.word_boost).toContain("EMDR");
    expect(createBody.audio_url).toBe("https://cdn/aud");

    // Mapping: ms→s, first speaker→clinician, second→client, ordered.
    expect(segs.map((s) => s.speaker)).toEqual(["clinician", "client"]);
    expect(segs[0]).toMatchObject({ start: 0, end: 1.5, text: "Hello." });
    expect(segs[1]).toMatchObject({ start: 1.6, end: 3, text: "Hi there." });
  });

  it("throws ProviderError when the job errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ upload_url: "u" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1", status: "queued" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1", status: "error", error: "bad audio" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AssemblyAiProvider("k");
    await expect(provider.transcribeBatch(Buffer.from("x"))).rejects.toThrow(/bad audio/);
  });

  it("throws when upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(new AssemblyAiProvider("k").transcribeBatch(Buffer.from("x"))).rejects.toThrow(
      /upload failed/,
    );
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  send(d: unknown): void {
    this.sent.push(d);
  }
  close(): void {
    this.onclose?.();
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("AssemblyAiProvider — stream", () => {
  it("fetches a temp token, opens a WS, and maps partial/final transcripts", async () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ token: "tok" }) })));
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const provider = new AssemblyAiProvider("k");
    const partials: string[] = [];
    const segs: { text: string; start: number; end: number }[] = [];
    const stream = provider.openStream({
      onPartial: (t) => partials.push(t),
      onSegment: (s) => segs.push({ text: s.text, start: s.start, end: s.end }),
    });
    stream.pushAudio(Buffer.from([1, 2])); // buffered until open
    await tick();

    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toContain("token=tok");
    expect(ws.sent.length).toBe(1); // flushed audio as base64 JSON

    ws.emit({ message_type: "PartialTranscript", text: "hel" });
    ws.emit({ message_type: "FinalTranscript", text: "hello", audio_start: 0, audio_end: 1200, confidence: 0.9 });
    expect(partials).toEqual(["hel"]);
    expect(segs).toEqual([{ text: "hello", start: 0, end: 1.2 }]);

    await stream.close();
    expect(ws.sent.some((m) => typeof m === "string" && m.includes("terminate_session"))).toBe(true);
  });
});
