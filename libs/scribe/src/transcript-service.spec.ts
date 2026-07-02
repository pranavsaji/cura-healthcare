import { describe, it, expect } from "vitest";
import { ForbiddenError } from "@cura/shared";
import { makeHarness, fakeAudio } from "../test/support.js";
import { recordingKey } from "./storage/index.js";

describe("TranscriptService — upload ingest (batch)", () => {
  it("stores encrypted audio, runs the batch re-pass, persists transcript, and marks ready", async () => {
    const h = makeHarness({ orgId: "org_a", userId: "user_a" }, { retentionDays: 30 });
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "upload" });
    await h.services.sessions.recordConsent(h.store, s.id);

    const audio = fakeAudio(["clinician: How are you?", "client: Rough week."]);
    const result = await h.services.transcripts.ingestUpload(h.store, s.id, audio, { ext: "wav" });

    // Transcript produced + persisted, ordered + diarized.
    expect(result.segments.map((x) => x.speaker)).toEqual(["clinician", "client"]);
    const persisted = await h.store.getTranscript(s.id);
    expect(persisted).toHaveLength(2);

    // Audio actually stored under the org-namespaced key.
    expect(result.storageKey.startsWith("orgs/org_a/sessions/")).toBe(true);
    expect(await h.objectStore.exists(result.storageKey)).toBe(true);

    // Retention window applied (30 days from the fixed clock).
    expect(result.retentionExpiresAt).toBe("2026-07-01T00:00:00.000Z");

    // Session advanced to ready.
    expect((await h.store.getSession(s.id))?.status).toBe("ready");

    // Audit: upload + transcript, both PHI-touching.
    const actions = h.actions();
    expect(actions).toContain("recording.uploaded");
    expect(actions).toContain("transcript.created");
    const uploaded = h.auditStore.events.find((e) => e.action === "recording.uploaded");
    expect(uploaded?.phiTouched).toBe(true);
  });

  it("rejects upload ingest without consent", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "upload" });
    await expect(
      h.services.transcripts.ingestUpload(h.store, s.id, fakeAudio(["client: hi"])),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // No audio stored, no transcript.
    expect(await h.store.getTranscript(s.id)).toHaveLength(0);
  });

  it("dictation upload pins the transcript to the clinician", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "dictation" });
    await h.services.sessions.recordConsent(h.store, s.id);
    const { segments } = await h.services.transcripts.ingestUpload(
      h.store,
      s.id,
      fakeAudio(["Patient stable.", "Continue meds."]),
    );
    expect(segments.every((x) => x.speaker === "clinician")).toBe(true);
  });
});

describe("TranscriptService — presign + re-pass", () => {
  it("presigns an upload (consent required) and returns a retention window", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "upload" });
    await expect(h.services.transcripts.presignUpload(h.store, s.id)).rejects.toBeInstanceOf(ForbiddenError);
    await h.services.sessions.recordConsent(h.store, s.id);
    const presigned = await h.services.transcripts.presignUpload(h.store, s.id, { contentType: "audio/wav", ext: "wav" });
    expect(presigned.method).toBe("PUT");
    expect(presigned.key.startsWith("orgs/")).toBe(true);
    expect(presigned.retentionExpiresAt).toBeTruthy();
  });

  it("re-pass replaces a streamed transcript with the batch result", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "live" });
    await h.services.sessions.recordConsent(h.store, s.id);
    // Simulate a live session that streamed a rough draft, then ended.
    const handle = await h.services.capture.beginCapture(h.store, s.id, { partial: () => {}, segment: () => {} });
    handle.pushText("rough draft", "client");
    await handle.stop(); // → transcribing

    const audio = fakeAudio(["clinician: Refined line one.", "client: Refined line two."]);
    const segments = await h.services.transcripts.rePass(h.store, s.id, audio);
    expect(segments).toHaveLength(2);
    const persisted = await h.store.getTranscript(s.id);
    expect(persisted.map((x) => x.text)).toEqual(["Refined line one.", "Refined line two."]);
    expect((await h.store.getSession(s.id))?.status).toBe("ready");
  });
});

describe("recordingKey", () => {
  it("namespaces by org and normalizes the extension", () => {
    const key = recordingKey({ orgId: "o1", sessionId: "s1", recordingId: "r1", ext: ".mp3" });
    expect(key).toBe("orgs/o1/sessions/s1/recordings/r1.mp3");
  });
});
