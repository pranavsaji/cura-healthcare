import { describe, it, expect } from "vitest";
import { ForbiddenError, type TranscriptSegment } from "@cura/shared";
import type { Speaker } from "@cura/transcription";
import { makeHarness } from "../test/support.js";
import type { CapturePublisher } from "./capture-service.js";

function recorder() {
  const partials: { text: string; speaker: Speaker }[] = [];
  const segments: TranscriptSegment[] = [];
  const errors: string[] = [];
  const publisher: CapturePublisher = {
    partial: (text, speaker) => void partials.push({ text, speaker }),
    segment: (segment) => void segments.push(segment),
    error: (message) => void errors.push(message),
  };
  return { publisher, partials, segments, errors };
}

describe("CaptureService", () => {
  it("refuses to begin capture without consent (nothing published)", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "live" });
    const { publisher, segments } = recorder();
    await expect(h.services.capture.beginCapture(h.store, s.id, publisher)).rejects.toBeInstanceOf(ForbiddenError);
    expect(segments).toHaveLength(0);
  });

  it("persists ordered segments and publishes partials + segments for a live session", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "live" });
    await h.services.sessions.recordConsent(h.store, s.id);

    const { publisher, partials, segments } = recorder();
    const handle = await h.services.capture.beginCapture(h.store, s.id, publisher);
    handle.pushText("Hi, how are you?", "clinician");
    handle.pushText("Anxious this week.", "client");
    const stopped = await handle.stop();

    // Published + persisted, in order.
    expect(partials.map((p) => p.text)).toEqual(["Hi, how are you?", "Anxious this week."]);
    expect(segments.map((s2) => s2.text)).toEqual(["Hi, how are you?", "Anxious this week."]);
    const persisted = await h.store.getTranscript(s.id);
    expect(persisted.map((p) => p.text)).toEqual(["Hi, how are you?", "Anxious this week."]);
    expect(persisted[0]!.start).toBeLessThan(persisted[1]!.start);

    expect(stopped.status).toBe("transcribing");
  });

  it("dictation mode pins all segments to the clinician", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "dictation" });
    await h.services.sessions.recordConsent(h.store, s.id);
    const { publisher } = recorder();
    const handle = await h.services.capture.beginCapture(h.store, s.id, publisher);
    handle.pushText("Patient reports improved sleep.", "client");
    await handle.stop();
    const persisted = await h.store.getTranscript(s.id);
    expect(persisted.every((p) => p.speaker === "clinician")).toBe(true);
  });
});
