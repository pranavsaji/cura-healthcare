import { describe, expect, it } from "vitest";
import { FallbackConnector } from "./adapters/fallback.js";
import { type HttpClient, type HttpRequest, type HttpResponse, SimplePracticeConnector } from "./adapters/simplepractice.js";
import type { EhrConnector, EhrCredentials } from "./types.js";

/**
 * Contract test: every adapter (incl. fallback) must satisfy the SAME interface
 * and return the SAME result shape (CONVENTIONS §5). This is what lets the
 * registry treat any vendor uniformly and the workflow reason about failures.
 */

/** A fake HTTP client that returns 2xx success for every SimplePractice route. */
const happyHttp: HttpClient = {
  async request(req: HttpRequest): Promise<HttpResponse> {
    if (req.path === "/v1/me") return { status: 200, body: {} };
    if (req.path === "/v1/clients") return { status: 200, body: { data: [{ id: "c1", name: "Client A" }] } };
    if (req.path.endsWith("/notes")) return { status: 201, body: { id: "n1", url: "https://ehr/n1" } };
    if (req.path.endsWith("/attach")) return { status: 200, body: {} };
    return { status: 200, body: { status: "accepted" } };
  },
};

const creds: EhrCredentials = { orgId: "org-1", vendor: "x", secrets: { accessToken: "t" } };

const connectors: { name: string; make: () => EhrConnector }[] = [
  { name: "fallback", make: () => new FallbackConnector() },
  { name: "simplepractice", make: () => new SimplePracticeConnector(happyHttp) },
];

function isResultShape(r: unknown): boolean {
  return typeof r === "object" && r !== null && "ok" in r && typeof (r as { ok: unknown }).ok === "boolean";
}

describe.each(connectors)("EhrConnector contract: $name", ({ make }) => {
  it("exposes vendor + a full capability map", () => {
    const c = make();
    expect(typeof c.vendor).toBe("string");
    for (const cap of ["findClient", "createNote", "attachEncounter", "realtimeStatus"] as const) {
      expect(typeof c.capabilities[cap]).toBe("boolean");
    }
  });

  it("every method returns a Result (never throws for expected paths)", async () => {
    const c = make();
    const client = { externalId: "c1", label: "Client A" };
    const note = { clientLabel: "Client A", format: "SOAP", text: "note body" };

    expect(isResultShape(await c.authenticate(creds))).toBe(true);
    expect(isResultShape(await c.findClient(creds, { label: "Client A" }))).toBe(true);
    const created = await c.createNote(creds, client, note, "key-1");
    expect(isResultShape(created)).toBe(true);
    const ref = created.ok ? created.value : { externalId: "n1" };
    expect(isResultShape(await c.attachToEncounter(creds, ref, client))).toBe(true);
    expect(isResultShape(await c.status(creds, ref))).toBe(true);
  });
});
