import { describe, it, expect, vi, afterEach } from "vitest";
import type { TranscriptSegment } from "@cura/shared";
import { MockAsrProvider } from "@cura/transcription";
import { asrName, createAsrStream, __setAsrProvider } from "./asr.js";

afterEach(() => __setAsrProvider(undefined));

describe("providers/asr — delegation to @cura/transcription", () => {
  it("keyless env resolves to the mock provider and reports its name", () => {
    // env defaults to ASR_PROVIDER=mock in tests; the name is what `ready` advertises.
    expect(asrName()).toBe("mock");
  });

  it("streams pushText through partial → finalized segment (mock semantics)", () => {
    const partials: string[] = [];
    const segments: TranscriptSegment[] = [];
    const stream = createAsrStream({
      onPartial: (text) => partials.push(text),
      onSegment: (seg) => segments.push(seg),
    });
    stream.pushText("Hello there", "clinician");
    expect(partials).toEqual(["Hello there"]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ speaker: "clinician", text: "Hello there" });
    expect(segments[0]!.end).toBeGreaterThan(segments[0]!.start);
  });

  it("close() returns a Promise (real providers flush asynchronously)", async () => {
    const stream = createAsrStream({ onPartial: () => {}, onSegment: () => {} });
    const closed = stream.close();
    expect(closed).toBeInstanceOf(Promise);
    await closed;
  });

  it("__setAsrProvider overrides the singleton (test seam)", () => {
    const openStream = vi.fn((_cb: unknown, _options?: unknown) => ({
      pushAudio: () => {},
      pushText: () => {},
      close: async () => {},
    }));
    __setAsrProvider({ name: "fake", openStream, transcribeBatch: async () => [] });
    expect(asrName()).toBe("fake");
    createAsrStream({ onPartial: () => {}, onSegment: () => {} });
    expect(openStream).toHaveBeenCalledOnce();
    // Default options are threaded through to the provider.
    expect(openStream.mock.calls[0]![1]).toMatchObject({ sampleRate: 16000, diarize: true });
  });

  it("mock provider satisfies the same interface used by handlers", () => {
    __setAsrProvider(new MockAsrProvider());
    expect(asrName()).toBe("mock");
  });
});
