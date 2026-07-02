import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { NotFoundError } from "@cura/shared";
import { LocalObjectStore } from "./local.js";
import {
  MemoryObjectStore,
  createObjectStore,
  recordingKey,
  assertOrgScoped,
} from "./index.js";

const tempRoots: string[] = [];
afterAll(async () => {
  for (const root of tempRoots) await rm(root, { recursive: true, force: true });
});

async function tempLocalStore(): Promise<LocalObjectStore> {
  const root = await mkdtemp(join(tmpdir(), "cura-obj-"));
  tempRoots.push(root);
  return new LocalObjectStore(root);
}

const KEY = recordingKey({ orgId: "o1", sessionId: "s1", recordingId: "r1", ext: "wav" });

describe.each([
  ["memory", () => Promise.resolve(new MemoryObjectStore())],
  ["local", () => tempLocalStore()],
])("ObjectStore contract — %s", (_name, make) => {
  it("put → get → exists → delete round-trips", async () => {
    const store = await make();
    const body = Buffer.from("audio-bytes");
    const res = await store.put(KEY, body, { contentType: "audio/wav" });
    expect(res).toEqual({ key: KEY, size: body.byteLength });
    expect(await store.exists(KEY)).toBe(true);
    expect((await store.get(KEY)).toString()).toBe("audio-bytes");
    await store.delete(KEY);
    expect(await store.exists(KEY)).toBe(false);
  });

  it("get on a missing key throws NotFound", async () => {
    const store = await make();
    await expect(store.get("orgs/o1/sessions/s1/recordings/missing.wav")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("presignUpload returns a PUT descriptor with the key + expiry", async () => {
    const store = await make();
    const presigned = await store.presignUpload(KEY, { contentType: "audio/wav" });
    expect(presigned.method).toBe("PUT");
    expect(presigned.key).toBe(KEY);
    expect(new Date(presigned.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("LocalObjectStore safety", () => {
  it("refuses path-traversal keys", async () => {
    const store = await tempLocalStore();
    await expect(store.put("../../etc/passwd", Buffer.from("x"))).rejects.toThrow(/unsafe|not/i);
  });
});

describe("key helpers", () => {
  it("assertOrgScoped rejects keys outside the org prefix", () => {
    expect(() => assertOrgScoped("orgs/o1/x", "o1")).not.toThrow();
    expect(() => assertOrgScoped("orgs/o2/x", "o1")).toThrow(/not scoped/);
  });
});

describe("createObjectStore", () => {
  it("defaults to memory and builds local", () => {
    expect(createObjectStore().kind).toBe("memory");
    expect(createObjectStore({ provider: "local", root: "/tmp/x" }).kind).toBe("local");
  });
  it("requires kmsKeyId for s3 (no unencrypted PHI at rest)", () => {
    expect(() =>
      createObjectStore({
        provider: "s3",
        bucket: "b",
        region: "us-east-1",
        credentials: { accessKeyId: "a", secretAccessKey: "s" },
      }),
    ).toThrow(/kmsKeyId/);
  });
});
