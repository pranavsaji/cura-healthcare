import { describe, expect, it, vi } from "vitest";
import { isErr, isOk } from "@cura/shared";
import { type HttpClient, type HttpResponse, SimplePracticeConnector } from "./adapters/simplepractice.js";
import type { EhrCredentials } from "./types.js";

const creds: EhrCredentials = { orgId: "org-1", vendor: "simplepractice", secrets: { accessToken: "tok" } };

/** Build an http client that returns a scripted response for the next call(s). */
function scriptHttp(responses: HttpResponse[]): HttpClient & { calls: number } {
  let i = 0;
  const client = {
    calls: 0,
    async request(): Promise<HttpResponse> {
      client.calls += 1;
      return responses[Math.min(i++, responses.length - 1)]!;
    },
  };
  return client;
}

describe("SimplePracticeConnector", () => {
  it("returns an auth error (non-retryable) when credentials are missing", async () => {
    const c = new SimplePracticeConnector(scriptHttp([{ status: 200, body: {} }]));
    const r = await c.authenticate({ ...creds, secrets: {} });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toMatchObject({ kind: "auth", retryable: false });
  });

  it("maps HTTP status codes to the typed error taxonomy", async () => {
    const cases: [number, string, boolean][] = [
      [401, "auth", false],
      [404, "not_found", false],
      [429, "rate_limited", true],
      [500, "unavailable", true],
      [0, "unavailable", true],
    ];
    for (const [status, kind, retryable] of cases) {
      const c = new SimplePracticeConnector(scriptHttp([{ status, body: {} }]));
      const r = await c.authenticate(creds);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error).toMatchObject({ kind, retryable });
    }
  });

  it("creates a note and forwards the idempotency key as a header", async () => {
    const http = { calls: 0, request: vi.fn(async () => ({ status: 201, body: { id: "note-1", url: "u" } })) };
    const c = new SimplePracticeConnector(http);
    const r = await c.createNote(creds, { externalId: "c1", label: "A" }, { clientLabel: "A", format: "SOAP", text: "x" }, "IDK-123");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.externalId).toBe("note-1");
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "IDK-123" }) }),
    );
  });

  it("treats a 409 idempotency conflict as the SAME note (no duplicate)", async () => {
    const c = new SimplePracticeConnector(scriptHttp([{ status: 409, body: { id: "existing-note" } }]));
    const r = await c.createNote(creds, { externalId: "c1", label: "A" }, { clientLabel: "A", format: "SOAP", text: "x" }, "IDK");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.externalId).toBe("existing-note");
  });

  it("finds a client or reports not_found", async () => {
    const found = new SimplePracticeConnector(scriptHttp([{ status: 200, body: { data: [{ id: "c9", name: "Jane" }] } }]));
    const r1 = await found.findClient(creds, { label: "Jane" });
    expect(isOk(r1) && r1.value.externalId).toBe("c9");

    const none = new SimplePracticeConnector(scriptHttp([{ status: 200, body: { data: [] } }]));
    const r2 = await none.findClient(creds, { label: "Nobody" });
    expect(isErr(r2) && r2.error.kind).toBe("not_found");
  });
});
