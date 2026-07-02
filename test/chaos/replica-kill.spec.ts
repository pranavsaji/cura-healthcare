import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../apps/api/src/app.js";
import {
  MemoryStoreFactory,
  createMemoryPlatform,
  type Platform,
} from "../../apps/api/src/platform/index.js";
import { DEV_ORG_ID, DEV_USER_IDS } from "../../apps/api/src/platform/directory.js";

/**
 * Phase 16 chaos — replica kill. The apps are STATELESS: any state a request
 * needs is rebuilt from the shared stores (CONVENTIONS §2), so killing an API
 * replica mid-flow must not lose data. We simulate a replica dying (close app A)
 * and a fresh replica (app B) coming up on the SAME platform stores, then prove
 * the in-flight session + note are still fully reconstructable.
 *
 * (Cross-replica WebSocket resume over Redis pub/sub is separately proven by
 * `apps/api/test/realtime.int.spec.ts` with Testcontainers.)
 */
const SECRET = "test-secret-at-least-16-chars-long";

function bearer(platform: Platform): { authorization: string } {
  return {
    authorization: `Bearer ${platform.auth.issueSession({
      userId: DEV_USER_IDS.clinician,
      orgId: DEV_ORG_ID,
      role: "clinician",
    })}`,
  };
}

describe("chaos · API replica kill mid-flow", () => {
  let apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps = [];
  });

  it("a note created on replica A is served by replica B after A dies", async () => {
    // One platform = shared stores; two app instances = two replicas.
    const platform = createMemoryPlatform({ sessionSecret: SECRET });
    const auth = bearer(platform);

    const replicaA = await buildApp(platform);
    apps.push(replicaA);

    const created = await replicaA.inject({
      method: "POST",
      url: "/sessions",
      headers: auth,
      payload: { clientLabel: "Client-Resilient" },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().id as string;

    await replicaA.inject({ method: "POST", url: `/sessions/${sessionId}/consent`, headers: auth });
    await replicaA.inject({ method: "POST", url: `/sessions/${sessionId}/audio`, headers: auth, payload: { audio: "AAAA" } });
    const gen = await replicaA.inject({ method: "POST", url: `/sessions/${sessionId}/generate`, headers: auth });
    expect(gen.statusCode).toBe(201);
    const noteId = gen.json().id as string;

    // KILL replica A abruptly.
    await replicaA.close();
    apps = [];

    // A brand-new replica comes up on the same stores — no shared memory with A.
    const replicaB = await buildApp(platform);
    apps.push(replicaB);

    const note = await replicaB.inject({ method: "GET", url: `/notes/${noteId}`, headers: auth });
    expect(note.statusCode).toBe(200);
    expect(note.json().id).toBe(noteId);
    expect(note.json().sections.length).toBeGreaterThan(0);

    const session = await replicaB.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: auth });
    expect(session.statusCode).toBe(200);
    expect(session.json().session.status).toBe("noted");
    expect(session.json().note.id).toBe(noteId);
  });

  it("stores are the source of truth, independent of any app instance", async () => {
    // Even with NO app at all, the factory reconstructs tenant state.
    const factory = new MemoryStoreFactory();
    const store = await factory.forTenant({ orgId: DEV_ORG_ID, userId: DEV_USER_IDS.clinician });
    const s = await store.createSession({ clientLabel: "X", source: "live" });
    const again = await factory.forTenant({ orgId: DEV_ORG_ID, userId: DEV_USER_IDS.clinician });
    expect((await again.getSession(s.id))?.id).toBe(s.id);
  });
});
