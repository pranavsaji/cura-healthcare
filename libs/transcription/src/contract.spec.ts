import { describe, it, expect } from "vitest";
import { TranscriptSegment } from "@cura/shared";
import type { AsrProvider, Speaker } from "./types.js";
import { MockAsrProvider } from "./mock.js";
import { DeepgramProvider } from "./deepgram.js";
import { AssemblyAiProvider } from "./assemblyai.js";

/**
 * The provider CONTRACT. Every ASR backend — mock and real — must satisfy this
 * exact suite so `mock` and production can never drift (CONVENTIONS §5). The
 * mock always runs; real providers run only when their key is present in the
 * env (CI secret-gated), so the default `pnpm test` needs no network.
 */

const NORMALIZED: Speaker[] = ["clinician", "client", "unknown"];

/** A short, known "session" fed via pushText (works for every provider). */
const SCRIPT: { text: string; speaker: Speaker }[] = [
  { text: "Hi, good to see you. How has your week been?", speaker: "clinician" },
  { text: "Honestly pretty rough, my anxiety has been spiking.", speaker: "client" },
  { text: "Let's try a grounding exercise together.", speaker: "clinician" },
];

export function runAsrContract(makeProvider: () => AsrProvider): void {
  it("streams partials then well-formed, ordered segments", async () => {
    const provider = makeProvider();
    const partials: string[] = [];
    const segments: TranscriptSegment[] = [];
    const stream = provider.openStream({
      onPartial: (text) => partials.push(text),
      onSegment: (seg) => segments.push(seg),
    });
    for (const line of SCRIPT) stream.pushText(line.text, line.speaker);
    await stream.close();

    expect(partials.length).toBeGreaterThan(0);
    expect(segments.length).toBe(SCRIPT.length);

    let prevStart = -Infinity;
    for (const seg of segments) {
      // Shape: passes the shared zod schema.
      expect(() => TranscriptSegment.parse(seg)).not.toThrow();
      // Normalized speaker role.
      expect(NORMALIZED).toContain(seg.speaker);
      // Timing sane + monotonic.
      expect(seg.end).toBeGreaterThanOrEqual(seg.start);
      expect(seg.start).toBeGreaterThanOrEqual(prevStart);
      prevStart = seg.start;
      // Confidence in [0,1].
      expect(seg.confidence).toBeGreaterThanOrEqual(0);
      expect(seg.confidence).toBeLessThanOrEqual(1);
      // Non-empty text.
      expect(seg.text.length).toBeGreaterThan(0);
    }
  });

  it("normalizes speakers: first distinct → clinician, second → client", async () => {
    const provider = makeProvider();
    const segments: TranscriptSegment[] = [];
    const stream = provider.openStream({ onPartial: () => {}, onSegment: (s) => segments.push(s) });
    for (const line of SCRIPT) stream.pushText(line.text, line.speaker);
    await stream.close();
    expect(segments[0]?.speaker).toBe("clinician");
    expect(segments[1]?.speaker).toBe("client");
  });

  it("dictation mode pins every segment to the fixed speaker", async () => {
    const provider = makeProvider();
    const segments: TranscriptSegment[] = [];
    const stream = provider.openStream(
      { onPartial: () => {}, onSegment: (s) => segments.push(s) },
      { fixedSpeaker: "clinician" },
    );
    stream.pushText("Patient presents with improved mood.", "client");
    stream.pushText("Plan is to continue weekly sessions.");
    await stream.close();
    expect(segments.every((s) => s.speaker === "clinician")).toBe(true);
  });
}

describe("ASR contract — mock", () => {
  runAsrContract(() => new MockAsrProvider());

  it("batch re-pass returns a full, ordered transcript", async () => {
    const provider = new MockAsrProvider();
    const audio = Buffer.from(
      ["clinician: How are you today?", "client: A little anxious but better.", "clinician: Good progress."].join("\n"),
      "utf8",
    );
    const segments = await provider.transcribeBatch(audio);
    expect(segments.length).toBe(3);
    expect(segments[0]?.speaker).toBe("clinician");
    expect(segments[1]?.speaker).toBe("client");
    for (const seg of segments) expect(() => TranscriptSegment.parse(seg)).not.toThrow();
  });
});

// Real providers: only when keyed. Skipped by default so CI stays offline.
const DG_KEY = process.env.DEEPGRAM_API_KEY;
describe.skipIf(!DG_KEY)("ASR contract — deepgram (keyed)", () => {
  runAsrContract(() => new DeepgramProvider(DG_KEY!));
});

const AAI_KEY = process.env.ASSEMBLYAI_API_KEY;
describe.skipIf(!AAI_KEY)("ASR contract — assemblyai (keyed)", () => {
  runAsrContract(() => new AssemblyAiProvider(AAI_KEY!));
});
