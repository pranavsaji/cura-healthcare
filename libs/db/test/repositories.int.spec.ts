import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FixedClock, fixedIdGen } from "@cura/core";
import { createRepositories, type Repositories } from "../src/repositories/index.js";
import { createEncryptor, staticKeyProvider } from "../src/encryption.js";
import { seed, SEED_IDS } from "../src/seed.js";
import { startTestDb, type TestDb } from "./support.js";

const KEY = "integration-test-encryption-key-01";

let h: TestDb;
let repos: Repositories;

beforeAll(async () => {
  h = await startTestDb();
  repos = createRepositories(h.db, {
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: fixedIdGen("t"),
    encryptor: createEncryptor(staticKeyProvider(KEY)),
  });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("tenant isolation (the core guarantee)", () => {
  it("never leaks rows across orgs through any repo method", async () => {
    const orgA = await repos.orgs.create({ name: "Org A" });
    const orgB = await repos.orgs.create({ name: "Org B" });

    const userA = await repos.users.create(orgA.id, { email: "a@a.io", name: "A" });
    const userB = await repos.users.create(orgB.id, { email: "b@b.io", name: "B" });

    await repos.sessions.create(orgA.id, { clinicianId: userA.id, clientLabel: "A-client" });
    await repos.sessions.create(orgB.id, { clinicianId: userB.id, clientLabel: "B-client" });
    await repos.clients.create(orgA.id, { displayLabel: "A-secret", mrn: "A-mrn" });
    await repos.clients.create(orgB.id, { displayLabel: "B-secret", mrn: "B-mrn" });

    // Org A sees only its own rows.
    const aSessions = await repos.sessions.list(orgA.id);
    expect(aSessions.items).toHaveLength(1);
    expect(aSessions.items[0]!.clientLabel).toBe("A-client");

    const aClients = await repos.clients.list(orgA.id);
    expect(aClients.map((c) => c.displayLabel)).toEqual(["A-secret"]);

    // Cross-tenant reads by id return nothing.
    const bSession = (await repos.sessions.list(orgB.id)).items[0]!;
    expect(await repos.sessions.byId(orgA.id, bSession.id)).toBeNull();
    expect(await repos.users.byId(orgA.id, userB.id)).toBeNull();
  });
});

describe("PII encryption at rest", () => {
  it("stores ciphertext on disk but returns plaintext through the repo", async () => {
    const org = await repos.orgs.create({ name: "Crypto Org" });
    const created = await repos.clients.create(org.id, {
      displayLabel: "J. Doe · 40M",
      mrn: "MRN-XYZ",
    });

    // Through the repo → plaintext.
    expect(created.displayLabel).toBe("J. Doe · 40M");
    expect(created.mrn).toBe("MRN-XYZ");

    // Raw SQL → ciphertext (never the plaintext).
    const raw = await h.sql`select display_label, mrn from clients where id = ${created.id}`;
    const row = raw[0]!;
    expect(row.display_label).not.toContain("Doe");
    expect(String(row.display_label)).toMatch(/^v1\./);
    expect(String(row.mrn)).toMatch(/^v1\./);
  });
});

describe("deterministic seed", () => {
  it("produces a usable org with default templates", async () => {
    const result = await seed(h.db, KEY);
    expect(result.orgId).toBe(SEED_IDS.org);
    const templates = await repos.templates.list(SEED_IDS.org);
    expect(templates.length).toBeGreaterThanOrEqual(4);
    const def = await repos.templates.defaultTemplate(SEED_IDS.org);
    expect(def?.format).toBe("SOAP");

    // Seeded client is decryptable with the same key.
    const seededClients = await repos.clients.list(SEED_IDS.org);
    expect(seededClients.map((c) => c.displayLabel)).toContain("S. Mitchell · 32F");
  });
});
