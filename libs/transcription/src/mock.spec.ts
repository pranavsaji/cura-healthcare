import { describe, it, expect } from "vitest";
import { MockAsrProvider, buildSegment } from "./mock.js";

describe("MockAsrProvider — stream", () => {
  it("ignores raw audio but emits partial + segment for pushText", async () => {
    const provider = new MockAsrProvider();
    const partials: string[] = [];
    const segs: { text: string; speaker: string }[] = [];
    const stream = provider.openStream({
      onPartial: (t) => partials.push(t),
      onSegment: (s) => segs.push({ text: s.text, speaker: s.speaker }),
    });
    stream.pushAudio(Buffer.from([1, 2, 3])); // no-op
    stream.pushText("I feel anxious", "client");
    await stream.close();
    expect(partials).toEqual(["I feel anxious"]);
    // "client" is an explicit role word → passes through unchanged.
    expect(segs).toEqual([{ text: "I feel anxious", speaker: "client" }]);
  });

  it("advances timing monotonically across utterances", async () => {
    const provider = new MockAsrProvider();
    const starts: number[] = [];
    const stream = provider.openStream({ onPartial: () => {}, onSegment: (s) => starts.push(s.start) });
    stream.pushText("one two three", "clinician");
    stream.pushText("four five", "client");
    await stream.close();
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThan(0);
  });

  it("skips empty/whitespace text", async () => {
    const provider = new MockAsrProvider();
    const segs: unknown[] = [];
    const stream = provider.openStream({ onPartial: () => {}, onSegment: (s) => segs.push(s) });
    stream.pushText("   ");
    await stream.close();
    expect(segs).toHaveLength(0);
  });
});

describe("MockAsrProvider — batch", () => {
  it("parses speaker-prefixed lines into ordered, diarized segments", async () => {
    const provider = new MockAsrProvider();
    const audio = Buffer.from(["clinician: Hello there", "client: I am nervous"].join("\n"));
    const segs = await provider.transcribeBatch(audio);
    expect(segs.map((s) => s.speaker)).toEqual(["clinician", "client"]);
    expect(segs[1]!.start).toBeGreaterThan(segs[0]!.start);
  });

  it("alternates speakers starting with clinician when no prefix", async () => {
    const provider = new MockAsrProvider();
    const audio = Buffer.from(["How are you", "Not great"].join("\n"));
    const segs = await provider.transcribeBatch(audio);
    expect(segs.map((s) => s.speaker)).toEqual(["clinician", "client"]);
  });

  it("honors fixedSpeaker for dictation uploads", async () => {
    const provider = new MockAsrProvider();
    const audio = Buffer.from(["line one", "line two"].join("\n"));
    const segs = await provider.transcribeBatch(audio, { fixedSpeaker: "clinician" });
    expect(segs.every((s) => s.speaker === "clinician")).toBe(true);
  });

  it("returns [] for empty audio", async () => {
    const provider = new MockAsrProvider();
    expect(await provider.transcribeBatch(Buffer.from(""))).toEqual([]);
  });
});

describe("buildSegment", () => {
  it("estimates end from word count and rounds to 2dp", () => {
    const seg = buildSegment("one two three four five", "client", 1);
    expect(seg.start).toBe(1);
    expect(seg.end).toBe(3); // 1 + 5*0.4
    expect(seg.confidence).toBe(0.9);
  });
});
