import { describe, it, expect } from "vitest";
import { awsUriEncode, presignUrl, signRequest } from "./sigv4.js";

const creds = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
const now = new Date("2026-06-01T12:00:00.000Z");

describe("awsUriEncode", () => {
  it("encodes reserved chars and optionally preserves slashes", () => {
    expect(awsUriEncode("a b")).toBe("a%20b");
    expect(awsUriEncode("a/b", true)).toBe("a%2Fb");
    expect(awsUriEncode("a/b", false)).toBe("a/b");
    expect(awsUriEncode("A-Z_0.9~")).toBe("A-Z_0.9~");
  });
});

describe("presignUrl", () => {
  const base = {
    method: "PUT" as const,
    host: "bucket.s3.us-east-1.amazonaws.com",
    region: "us-east-1",
    key: "orgs/o1/sessions/s1/recordings/r1.wav",
    credentials: creds,
    expiresSec: 900,
    now,
  };

  it("produces a well-formed, deterministic presigned URL", () => {
    const url = presignUrl(base);
    expect(url).toContain("https://bucket.s3.us-east-1.amazonaws.com/orgs/o1/sessions/s1/recordings/r1.wav?");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=AKIDEXAMPLE%2F20260601%2Fus-east-1%2Fs3%2Faws4_request");
    expect(url).toContain("X-Amz-Expires=900");
    expect(url).toContain("X-Amz-SignedHeaders=host");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
    // Deterministic given fixed clock/creds.
    expect(presignUrl(base)).toBe(url);
  });

  it("changes the signature when the key changes", () => {
    const a = presignUrl(base);
    const b = presignUrl({ ...base, key: "orgs/o1/sessions/s1/recordings/other.wav" });
    expect(sig(a)).not.toBe(sig(b));
  });

  it("includes a session token when present", () => {
    const url = presignUrl({ ...base, credentials: { ...creds, sessionToken: "TOKEN123" } });
    expect(url).toContain("X-Amz-Security-Token=TOKEN123");
  });
});

describe("signRequest", () => {
  it("builds an Authorization header over the signed headers incl. SSE", () => {
    const headers = signRequest({
      method: "PUT",
      host: "bucket.s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      key: "orgs/o1/x.wav",
      credentials: creds,
      payload: Buffer.from("audio"),
      extraHeaders: { "x-amz-server-side-encryption": "aws:kms" },
      now,
    });
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
    expect(headers.Authorization).toContain("SignedHeaders=");
    expect(headers.Authorization).toContain("x-amz-server-side-encryption");
    expect(headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
  });
});

function sig(url: string): string {
  return new URL(url).searchParams.get("X-Amz-Signature") ?? "";
}
