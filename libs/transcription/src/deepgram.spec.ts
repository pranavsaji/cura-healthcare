import { describe, it, expect, vi, afterEach } from "vitest";
import { DeepgramProvider } from "./deepgram.js";

/**
 * Offline tests for the Deepgram provider: global `fetch` and `WebSocket` are
 * stubbed so the request-building + response-mapping logic runs with no network.
 */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this);
    // Fire open on a later tick so the caller can attach handlers first.
    setTimeout(() => this.onopen?.(), 0);
  }
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.onclose?.();
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DeepgramProvider — batch (fetch stubbed)", () => {
  it("builds a keyed request and maps utterances to ordered segments", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => ({
      ok: true,
      json: async () => ({
        results: {
          utterances: [
            { speaker: 0, start: 0.0, end: 1.2, transcript: "How are you?", confidence: 0.98 },
            { speaker: 1, start: 1.5, end: 3.0, transcript: "Anxious.", confidence: 0.91 },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepgramProvider("secret-key", "nova-2-medical");
    const segs = await provider.transcribeBatch(Buffer.from("audio"), { vocabulary: ["CBT"] });

    // Request shape: keyed, correct URL + boosted keyword + utterances flag.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("api.deepgram.com/v1/listen");
    expect(String(url)).toContain("utterances=true");
    expect(String(url)).toContain("keywords=CBT");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Token secret-key" });

    // Mapping: normalized speakers, seconds, clamped confidence, ordered.
    expect(segs.map((s) => s.speaker)).toEqual(["clinician", "client"]);
    expect(segs[0]).toMatchObject({ start: 0, end: 1.2, text: "How are you?" });
    expect(segs[0]!.confidence).toBeCloseTo(0.98);
  });

  it("throws ProviderError on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    const provider = new DeepgramProvider("k");
    await expect(provider.transcribeBatch(Buffer.from("x"))).rejects.toThrow(/Deepgram batch failed/);
  });

  it("falls back to the primary alternative when there are no utterances", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: {
            channels: [{ alternatives: [{ transcript: "solo line", confidence: 0.8, words: [{ word: "solo", start: 0, end: 0.5 }] }] }],
          },
        }),
      })),
    );
    const segs = await new DeepgramProvider("k").transcribeBatch(Buffer.from("x"));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ text: "solo line", speaker: "unknown" });
  });

  it("returns [] when the response is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: {} }) })));
    expect(await new DeepgramProvider("k").transcribeBatch(Buffer.from("x"))).toEqual([]);
  });
});

describe("DeepgramProvider — stream (WebSocket stubbed)", () => {
  it("buffers audio until open, then flushes and maps results", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const provider = new DeepgramProvider("k");
    const partials: string[] = [];
    const segs: { text: string; speaker: string }[] = [];
    const stream = provider.openStream({
      onPartial: (t) => partials.push(t),
      onSegment: (s) => segs.push({ text: s.text, speaker: s.speaker }),
    });

    // Pushed before open → buffered.
    stream.pushAudio(Buffer.from([1, 2, 3]));
    await tick(); // open fires, buffer flushes

    const ws = FakeWebSocket.instances[0]!;
    expect(ws.protocols).toEqual(["token", "k"]);
    expect(ws.sent.length).toBe(1); // flushed audio frame

    // Interim then final result.
    ws.emit({ channel: { alternatives: [{ transcript: "hel", words: [{ word: "hel", start: 0, end: 0.3, speaker: 0 }] }] }, is_final: false });
    ws.emit({
      channel: { alternatives: [{ transcript: "hello there", confidence: 0.95, words: [{ word: "hello", start: 0, end: 0.5, speaker: 0 }, { word: "there", start: 0.5, end: 1.0, speaker: 0 }] }] },
      is_final: true,
    });

    expect(partials).toEqual(["hel"]);
    expect(segs).toEqual([{ text: "hello there", speaker: "clinician" }]);

    await stream.close();
    // Close asks Deepgram to flush.
    expect(ws.sent.some((m) => typeof m === "string" && m.includes("CloseStream"))).toBe(true);
  });
});
