import { describe, it, expect } from "vitest";
import { ForbiddenError, NotFoundError, ConflictError } from "@cura/shared";
import { makeHarness } from "../test/support.js";
import { canTransition } from "./session-service.js";

describe("SessionService — lifecycle + audit", () => {
  it("create → consent → start → stop advances status and audits each step", async () => {
    const h = makeHarness();
    const session = await h.services.sessions.create(h.store, { clientLabel: "S. M · 32F", source: "live" });
    expect(session.status).toBe("created");

    await h.services.sessions.recordConsent(h.store, session.id);
    const started = await h.services.sessions.startCapture(h.store, session.id);
    expect(started.status).toBe("recording");
    expect(started.startedAt).toBeTruthy();

    const stopped = await h.services.sessions.stopCapture(h.store, session.id);
    expect(stopped.status).toBe("transcribing");
    expect(stopped.endedAt).toBeTruthy();

    expect(h.actions()).toEqual([
      "session.created",
      "session.consent",
      "session.started",
      "session.stopped",
    ]);
  });
});

describe("SessionService — consent gating", () => {
  it("rejects startCapture without consent and audits a denied attempt", async () => {
    const h = makeHarness();
    const session = await h.services.sessions.create(h.store, { clientLabel: "C", source: "live" });

    await expect(h.services.sessions.startCapture(h.store, session.id)).rejects.toBeInstanceOf(ForbiddenError);

    // Session stayed in `created`; a denial was audited.
    expect((await h.store.getSession(session.id))?.status).toBe("created");
    const denied = h.auditStore.events.find((e) => e.action === "auth.denied");
    expect(denied).toBeTruthy();
    expect(denied?.context).toMatchObject({ reason: "consent_required", action: "session.start" });
  });

  it("assertConsent also denies + audits for the upload path", async () => {
    const h = makeHarness();
    const session = await h.services.sessions.create(h.store, { clientLabel: "C", source: "upload" });
    await expect(h.services.sessions.assertConsent(h.store, session.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.auditStore.events.some((e) => e.action === "auth.denied")).toBe(true);
  });
});

describe("SessionService — guards", () => {
  it("throws NotFound for an unknown session", async () => {
    const h = makeHarness();
    await expect(h.services.sessions.require(h.store, "sess_nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an invalid status transition", async () => {
    const h = makeHarness();
    const s = await h.services.sessions.create(h.store, { clientLabel: "C", source: "live" });
    await h.services.sessions.recordConsent(h.store, s.id);
    await h.services.sessions.recordConsent(h.store, s.id); // still `created`
    // Jump straight to stop (transcribing requires recording OR created — allowed),
    // but ready requires transcribing:
    await expect(h.services.sessions.markReady(h.store, s.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("canTransition", () => {
  it("encodes the status machine", () => {
    expect(canTransition("created", "recording")).toBe(true);
    expect(canTransition("created", "transcribing")).toBe(true);
    expect(canTransition("recording", "transcribing")).toBe(true);
    expect(canTransition("transcribing", "ready")).toBe(true);
    expect(canTransition("ready", "noted")).toBe(true);
    expect(canTransition("created", "ready")).toBe(false);
    expect(canTransition("noted", "recording")).toBe(false);
    expect(canTransition("ready", "ready")).toBe(true); // idempotent
  });
});
