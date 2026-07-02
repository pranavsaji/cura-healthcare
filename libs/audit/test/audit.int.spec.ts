import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FixedClock, type IdGen } from "@cura/core";
import { createRepositories, type Repositories } from "@cura/db";
import { startTestDb, type TestDb } from "@cura/db/testing";
import { createAuditLog } from "../src/audit.js";

/** Deterministic *valid-uuid* id generator (the id column is a uuid). */
function fixedUuidGen(): IdGen {
  let n = 0;
  return {
    next() {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
    },
  };
}

/**
 * Integration: the audit log persists a hash chain through `@cura/db`'s
 * `AuditRepo` on a real Postgres, and `verifyChain` detects a row tampered with
 * directly via SQL.
 */
const ORG = "00000000-0000-4000-8000-0000000000a1";

let h: TestDb;
let repos: Repositories;

beforeAll(async () => {
  h = await startTestDb();
  repos = createRepositories(h.db, { encryptionKey: "audit-int-key-000000000000" });
  // Audit rows FK to an org; create one.
  await repos.orgs.create({ id: ORG, name: "Audit Org" });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("audit chain persisted in Postgres", () => {
  it("records, verifies, and detects DB-level tampering", async () => {
    const log = createAuditLog({
      store: repos.audit,
      clock: new FixedClock("2026-02-01T00:00:00.000Z"),
      ids: fixedUuidGen(),
    });

    const e1 = await log.record({
      orgId: ORG,
      actor: "user_1",
      action: "session.created",
      resource: "session:s1",
    });
    const e2 = await log.record({
      orgId: ORG,
      actor: "user_1",
      action: "note.generated",
      resource: "note:n1",
      phiTouched: true,
    });
    const e3 = await log.record({
      orgId: ORG,
      actor: "user_1",
      action: "note.signed",
      resource: "note:n1",
    });

    expect(e1.prevHash).toBeNull();
    expect(e2.prevHash).toBe(e1.hash);
    expect(e3.prevHash).toBe(e2.hash);

    // Clean chain verifies.
    expect(await log.verifyChain(ORG)).toEqual({ ok: true, length: 3 });

    // Tamper directly in the database — change the middle event's resource.
    await h.sql`update audit_events set resource = ${"note:HACKED"} where id = ${e2.id}`;

    const v = await log.verifyChain(ORG);
    expect(v.ok).toBe(false);
    expect(v.brokenId).toBe(e2.id);
    expect(v.reason).toBe("hash_mismatch");
  });
});
