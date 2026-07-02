import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryPlatform } from "../src/platform/index.js";

/**
 * API gateway tests over the in-memory platform (no Docker). Proves the golden
 * path (templates → session → consent → generate → edit → sign → sync), that the
 * store swap kept the HTTP contract, and that every mutation is audited. Auth
 * uses the dev fallback (seeded admin) so no token is required here — RBAC and
 * 401 behavior are covered in auth.spec.ts.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(createMemoryPlatform());
});

afterAll(async () => {
  await app.close();
});

describe("API gateway (in-memory platform)", () => {
  it("reports health and readiness", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().ok).toBe(true);
  });

  it("lists seeded templates", async () => {
    const res = await app.inject({ method: "GET", url: "/templates" });
    expect(res.statusCode).toBe(200);
    const formats = res.json().map((t: { format: string }) => t.format);
    expect(formats).toContain("SOAP");
  });

  it("rejects an invalid session body with a typed 400", async () => {
    const res = await app.inject({ method: "POST", url: "/sessions", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("validation_error");
    expect(res.json().details).toBeTruthy();
  });

  it("runs the golden path create → generate → edit → sign → sync", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { clientLabel: "S. Mitchell · 32F", source: "live" },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().id as string;

    const consent = await app.inject({ method: "POST", url: `/sessions/${sessionId}/consent` });
    expect(consent.json().consentAt).toBeTruthy();

    const gen = await app.inject({ method: "POST", url: `/sessions/${sessionId}/generate` });
    expect(gen.statusCode).toBe(201);
    const note = gen.json();
    expect(note.sections.length).toBeGreaterThan(0);
    const sectionKey = note.sections[0].key as string;

    const edited = await app.inject({
      method: "PATCH",
      url: `/notes/${note.id}/section`,
      payload: { sectionKey, content: "Edited content." },
    });
    expect(edited.json().status).toBe("reviewed");
    expect(edited.json().sections[0].content).toBe("Edited content.");

    const signed = await app.inject({ method: "POST", url: `/notes/${note.id}/sign` });
    expect(signed.json().status).toBe("signed");

    const synced = await app.inject({ method: "POST", url: `/notes/${note.id}/sync` });
    expect(synced.json().note.status).toBe("synced");
    expect(typeof synced.json().formatted).toBe("string");
  });

  it("ingests an uploaded audio file into a transcript (consent required)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { clientLabel: "U. Ploaded · 40M", source: "upload" },
    });
    const sessionId = created.json().id as string;

    // Without consent, ingest is forbidden.
    const audio = Buffer.from("clinician: How are you?\nclient: Anxious.", "utf8").toString("base64");
    const denied = await app.inject({ method: "POST", url: `/sessions/${sessionId}/audio`, payload: { audio } });
    expect(denied.statusCode).toBe(403);

    // After consent, ingest runs the batch re-pass and persists the transcript.
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/consent` });
    const ingest = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/audio`,
      payload: { audio, ext: "wav" },
    });
    expect(ingest.statusCode).toBe(201);
    expect(ingest.json().segments.length).toBe(2);
    expect(ingest.json().storageKey).toMatch(/^orgs\//);

    const fetched = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(fetched.json().transcript.length).toBe(2);
    expect(fetched.json().session.status).toBe("ready");
  });

  it("presigns a direct upload (consent required)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { clientLabel: "P. Resign · 25F", source: "upload" },
    });
    const sessionId = created.json().id as string;
    const denied = await app.inject({ method: "POST", url: `/sessions/${sessionId}/upload-url`, payload: {} });
    expect(denied.statusCode).toBe(403);

    await app.inject({ method: "POST", url: `/sessions/${sessionId}/consent` });
    const presign = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/upload-url`,
      payload: { contentType: "audio/wav", ext: "wav" },
    });
    expect(presign.statusCode).toBe(200);
    expect(presign.json().method).toBe("PUT");
    expect(presign.json().key).toMatch(/^orgs\//);
  });

  it("records every mutation in the audit log (visible via /agent-runs)", async () => {
    const res = await app.inject({ method: "GET", url: "/agent-runs" });
    expect(res.statusCode).toBe(200);
    const actions = res.json().events.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "session.created",
        "session.consent",
        "note.generated",
        "note.edited",
        "note.signed",
        "note.synced",
      ]),
    );
  });

  it("404s for unknown ids with a typed body", async () => {
    const s = await app.inject({ method: "GET", url: "/sessions/nope" });
    expect(s.statusCode).toBe(404);
    expect(s.json().code).toBe("not_found");
    expect((await app.inject({ method: "GET", url: "/notes/nope" })).statusCode).toBe(404);
  });

  it("serves OpenAPI docs and the raw spec", async () => {
    const spec = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(spec.statusCode).toBe(200);
    expect(spec.json().openapi).toMatch(/^3\./);
    expect(spec.json().paths["/sessions"]).toBeTruthy();
  });
});
