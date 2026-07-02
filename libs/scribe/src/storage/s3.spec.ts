import { describe, it, expect, vi } from "vitest";
import { NotFoundError, ProviderError } from "@cura/shared";
import { S3ObjectStore } from "./s3.js";

const baseConfig = {
  bucket: "cura-audio",
  region: "us-east-1",
  credentials: { accessKeyId: "AKID", secretAccessKey: "SECRET" },
  kmsKeyId: "arn:aws:kms:us-east-1:1:key/abc",
  now: () => new Date("2026-06-01T00:00:00.000Z"),
};
const KEY = "orgs/o1/sessions/s1/recordings/r1.wav";

describe("S3ObjectStore (fetch stubbed)", () => {
  it("PUT signs the request and sends SSE-KMS headers", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const store = new S3ObjectStore(baseConfig, fetchImpl);
    const res = await store.put(KEY, Buffer.from("audio"), { contentType: "audio/wav" });
    expect(res.size).toBe(5);

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe(`https://cura-audio.s3.us-east-1.amazonaws.com/${KEY}`);
    expect(init.method).toBe("PUT");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(headers["x-amz-server-side-encryption"]).toBe("aws:kms");
    expect(headers["x-amz-server-side-encryption-aws-kms-key-id"]).toBe(baseConfig.kmsKeyId);
    expect(headers["content-type"]).toBe("audio/wav");
  });

  it("GET returns the body; 404 → NotFound; 500 → ProviderError", async () => {
    const ok = new S3ObjectStore(baseConfig, (async () => new Response("data", { status: 200 })) as typeof fetch);
    expect((await ok.get(KEY)).toString()).toBe("data");

    const missing = new S3ObjectStore(baseConfig, (async () => new Response(null, { status: 404 })) as typeof fetch);
    await expect(missing.get(KEY)).rejects.toBeInstanceOf(NotFoundError);

    const broken = new S3ObjectStore(baseConfig, (async () => new Response(null, { status: 500 })) as typeof fetch);
    await expect(broken.get(KEY)).rejects.toBeInstanceOf(ProviderError);
  });

  it("DELETE tolerates a 404 (idempotent) but not a 500", async () => {
    const gone = new S3ObjectStore(baseConfig, (async () => new Response(null, { status: 404 })) as typeof fetch);
    await expect(gone.delete(KEY)).resolves.toBeUndefined();
    const broken = new S3ObjectStore(baseConfig, (async () => new Response(null, { status: 500 })) as typeof fetch);
    await expect(broken.delete(KEY)).rejects.toBeInstanceOf(ProviderError);
  });

  it("presignUpload returns a signed URL + SSE headers the client must send", async () => {
    const store = new S3ObjectStore(baseConfig, (async () => new Response()) as typeof fetch);
    const presigned = await store.presignUpload(KEY, { contentType: "audio/wav", expiresSec: 600 });
    expect(presigned.url).toContain("X-Amz-Signature=");
    expect(presigned.url).toContain("X-Amz-Expires=600");
    expect(presigned.headers["x-amz-server-side-encryption"]).toBe("aws:kms");
    expect(presigned.expiresAt).toBe("2026-06-01T00:10:00.000Z");
  });
});
