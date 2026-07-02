import { describe, expect, it } from "vitest";
import { FixedClock, fixedIdGen } from "@cura/core";
import type { AuditInput } from "@cura/shared";
import {
  EhrRegistry,
  type EhrSyncRequest,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
  InMemoryJobStore,
  runEhrSync,
} from "@cura/ehr";

/**
 * Phase 13 acceptance gate, integrating the registry + the real SimplePractice
 * adapter + the durable workflow, driven by a scripted HTTP layer (no network).
 */

/** SimplePractice-shaped HTTP fake: note-create fails transiently, then succeeds. */
function flakyHttp(): HttpClient & { idempotencyKeys: string[]; noteCreateAttempts: number } {
  const state = { idempotencyKeys: [] as string[], noteCreateAttempts: 0 };
  const client: HttpClient & typeof state = {
    ...state,
    async request(req: HttpRequest): Promise<HttpResponse> {
      if (req.path === "/v1/me") return { status: 200, body: {} };
      if (req.path === "/v1/clients") return { status: 200, body: { data: [{ id: "c-42", name: "Client A" }] } };
      if (req.path.endsWith("/notes")) {
        client.noteCreateAttempts += 1;
        client.idempotencyKeys.push(req.headers?.["Idempotency-Key"] ?? "");
        if (client.noteCreateAttempts === 1) return { status: 503, body: {} }; // transient
        return { status: 201, body: { id: "sp-note-777" } };
      }
      if (req.path.endsWith("/attach")) return { status: 200, body: {} };
      return { status: 200, body: { status: "accepted" } };
    },
  };
  return client;
}

const request = (orgId: string): EhrSyncRequest => ({
  orgId,
  noteId: "note-1",
  vendor: "simplepractice",
  creds: { orgId, vendor: "simplepractice", secrets: { accessToken: "tok" } },
  clientQuery: { label: "Client A" },
  note: { clientLabel: "Client A", format: "SOAP", text: "Subjective: client reported progress." },
});

describe("EHR sync (integration: registry + SimplePractice + workflow)", () => {
  it("retries a transient note-create failure and succeeds with a single, idempotent note", async () => {
    const http = flakyHttp();
    const registry = new EhrRegistry({ http });
    const jobStore = new InMemoryJobStore({ clock: new FixedClock(), ids: fixedIdGen("job") });
    const audits: AuditInput[] = [];

    const out = await runEhrSync(request("org-1"), {
      connector: registry.get("simplepractice"),
      jobStore,
      audit: { record: async (i) => void audits.push(i) },
      sleep: async () => undefined,
      retry: { attempts: 3, baseMs: 1 },
    });

    expect(out.status).toBe("succeeded");
    expect(out.externalNoteId).toBe("sp-note-777");
    expect(http.noteCreateAttempts).toBe(2); // failed once, then succeeded
    // Both attempts carried the SAME idempotency key → the server can dedupe.
    expect(new Set(http.idempotencyKeys).size).toBe(1);
    expect(audits.map((a) => a.action)).toContain("note.sync.succeeded");
  });

  it("degrades to the fallback (assisted paste) when the vendor permanently rejects auth", async () => {
    const http: HttpClient = { async request() { return { status: 401, body: {} }; } };
    const registry = new EhrRegistry({ http });
    const jobStore = new InMemoryJobStore({ clock: new FixedClock(), ids: fixedIdGen("job") });

    const out = await runEhrSync(request("org-9"), {
      connector: registry.get("simplepractice"),
      jobStore,
      sleep: async () => undefined,
      retry: { attempts: 2, baseMs: 1 },
    });

    expect(out.status).toBe("dead_letter");
    expect(out.usedFallback).toBe(true);
    expect(out.fallbackText).toContain("SOAP NOTE — Client A");
  });
});
