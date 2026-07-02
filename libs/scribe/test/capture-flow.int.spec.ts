import { describe, it, expect } from "vitest";
import { NotFoundError } from "@cura/shared";
import type { CapturePublisher } from "../src/index.js";
import { makeHarness, fakeAudio } from "./support.js";

/**
 * Integration coverage for the full scribe capture flow against the in-memory
 * store + mock ASR + in-memory object store. The same flow runs against Postgres
 * when `DATABASE_URL` is set (a `PostgresStore` swapped in) — skipped otherwise so
 * the default run needs no Docker.
 */

const sink = (): { pub: CapturePublisher; texts: string[] } => {
  const texts: string[] = [];
  return {
    texts,
    pub: { partial: () => {}, segment: (s) => void texts.push(s.text) },
  };
};

describe("scribe capture flow (in-memory)", () => {
  it("live: consent → capture → ordered persisted transcript → note-ready handoff", async () => {
    const h = makeHarness({ orgId: "org_live", userId: "clin_1" });
    const s = await h.services.sessions.create(h.store, { clientLabel: "S. M · 32F", source: "live" });
    await h.services.sessions.recordConsent(h.store, s.id);

    const { pub, texts } = sink();
    const handle = await h.services.capture.beginCapture(h.store, s.id, pub);
    handle.pushText("Welcome back.", "clinician");
    handle.pushText("I've been anxious.", "client");
    handle.pushText("Let's do a grounding exercise.", "clinician");
    const stopped = await handle.stop();

    expect(stopped.status).toBe("transcribing");
    const transcript = await h.store.getTranscript(s.id);
    expect(transcript).toHaveLength(3);
    // Ordered by start time.
    expect(transcript.map((t) => t.start)).toEqual([...transcript.map((t) => t.start)].sort((a, b) => a - b));
    expect(texts).toEqual(["Welcome back.", "I've been anxious.", "Let's do a grounding exercise."]);

    // Every lifecycle action audited.
    expect(h.actions()).toEqual(
      expect.arrayContaining(["session.created", "session.consent", "session.started", "session.stopped"]),
    );
  });

  it("upload: audio buffer → batch transcript scoped to the org, fully audited", async () => {
    const h = makeHarness({ orgId: "org_up", userId: "clin_1" });
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "upload" });
    await h.services.sessions.recordConsent(h.store, s.id);
    const { segments, storageKey } = await h.services.transcripts.ingestUpload(
      h.store,
      s.id,
      fakeAudio(["clinician: How have things been?", "client: Up and down."]),
      { ext: "wav" },
    );
    expect(segments).toHaveLength(2);
    expect(storageKey.startsWith("orgs/org_up/")).toBe(true);
    expect((await h.store.getSession(s.id))?.status).toBe("ready");
    expect(h.actions()).toEqual(expect.arrayContaining(["recording.uploaded", "transcript.created"]));
  });

  it("tenant isolation: another org cannot read the session or transcript", async () => {
    const shared = makeHarness({ orgId: "org_x", userId: "clin_x" });
    const s = await shared.services.sessions.create(shared.store, { clientLabel: "C", source: "live" });
    await shared.services.sessions.recordConsent(shared.store, s.id);
    const { pub } = sink();
    const handle = await shared.services.capture.beginCapture(shared.store, s.id, pub);
    handle.pushText("private detail", "client");
    await handle.stop();

    // A different org's store has no visibility into org_x's session.
    const otherStore = new (shared.store.constructor as new (scope: { orgId: string; userId: string }) => typeof shared.store)({
      orgId: "org_y",
      userId: "clin_y",
    });
    expect(await otherStore.getSession(s.id)).toBeUndefined();
    expect(await otherStore.getTranscript(s.id)).toHaveLength(0);
    // The service require() surfaces it as NotFound for the other tenant.
    await expect(shared.services.sessions.require(otherStore, s.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
