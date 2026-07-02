import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sectionsForFormat } from "@cura/shared";
import { createRepositories } from "../src/repositories/index.js";
import { PostgresStore } from "../src/store.js";
import { seed } from "../src/seed.js";
import { startTestDb, type TestDb } from "./support.js";

const KEY = "store-int-encryption-key-abcdef01";

let h: TestDb;
let store: PostgresStore;

beforeAll(async () => {
  h = await startTestDb();
  const repos = createRepositories(h.db, { encryptionKey: KEY });
  const { orgId, clinicianId } = await seed(h.db, KEY);
  store = new PostgresStore(repos, { orgId, clinicianId });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("PostgresStore (Store contract, Postgres-backed)", () => {
  it("serves seeded templates with a SOAP default", async () => {
    const templates = await store.listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(4);
    expect((await store.defaultTemplate()).format).toBe("SOAP");
  });

  it("runs a full session → transcript → note → sign flow", async () => {
    const dap = (await store.listTemplates()).find((t) => t.format === "DAP")!;
    const session = await store.createSession({
      clientLabel: "T. User · 28N",
      source: "live",
      templateId: dap.id,
    });
    expect(session.status).toBe("created");

    // Chosen template is remembered on the session.
    expect((await store.templateForSession(session.id)).format).toBe("DAP");

    await store.updateSession(session.id, { status: "recording" });
    await store.appendSegment(session.id, {
      speaker: "client",
      start: 0,
      end: 2,
      text: "I felt calmer this week.",
      confidence: 0.95,
    });
    expect(await store.getTranscript(session.id)).toHaveLength(1);

    const note = await store.createNote({
      sessionId: session.id,
      templateId: dap.id,
      format: "DAP",
      sections: sectionsForFormat("DAP").map((s) => ({
        key: s.key,
        title: s.title,
        content: `content for ${s.key}`,
        evidence: [0],
      })),
      riskFlags: [],
      status: "draft",
      model: "mock",
      promptVersion: "test-v1",
    });
    expect(note.id).toMatch(/[0-9a-f-]{36}/);

    // Fetchable by id and by session.
    expect((await store.getNote(note.id))?.id).toBe(note.id);
    expect((await store.getNoteBySession(session.id))?.id).toBe(note.id);

    const signed = await store.updateNote(note.id, { status: "signed" });
    expect(signed?.status).toBe("signed");
  });

  it("returns undefined for missing ids (no cross-tenant leakage)", async () => {
    expect(await store.getSession("00000000-0000-4000-8000-0000000000ff")).toBeUndefined();
    expect(await store.getNote("00000000-0000-4000-8000-0000000000fe")).toBeUndefined();
  });
});
