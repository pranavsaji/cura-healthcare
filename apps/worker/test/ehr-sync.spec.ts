import { describe, expect, it } from "vitest";
import { FixedClock, fixedIdGen } from "@cura/core";
import type { AuditInput } from "@cura/shared";
import { type EhrSyncRequest, type HttpClient, InMemoryJobStore } from "@cura/ehr";
import { buildRegistry, ehrSyncActivity } from "../src/workflows/ehr-sync.js";

const happyHttp: HttpClient = {
  async request(req) {
    if (req.path === "/v1/me") return { status: 200, body: {} };
    if (req.path === "/v1/clients") return { status: 200, body: { data: [{ id: "c1", name: "A" }] } };
    if (req.path.endsWith("/notes")) return { status: 201, body: { id: "n1" } };
    return { status: 200, body: {} };
  },
};

const request = (vendor: string): EhrSyncRequest => ({
  orgId: "org-1",
  noteId: "note-1",
  vendor,
  creds: { orgId: "org-1", vendor, secrets: { accessToken: "t" } },
  clientQuery: { label: "Client A" },
  note: { clientLabel: "Client A", format: "SOAP", text: "body" },
});

describe("ehrSyncActivity (worker)", () => {
  it("runs the durable workflow for a known vendor and records jobs + audits", async () => {
    const jobStore = new InMemoryJobStore({ clock: new FixedClock(), ids: fixedIdGen("job") });
    const audits: AuditInput[] = [];
    const out = await ehrSyncActivity(request("simplepractice"), {
      registry: buildRegistry(happyHttp),
      jobStore,
      audit: { record: async (i) => void audits.push(i) },
    });
    expect(out.status).toBe("succeeded");
    expect(out.externalNoteId).toBe("n1");
    expect((await jobStore.list("org-1"))).toHaveLength(1);
    expect(audits.length).toBeGreaterThan(0);
  });

  it("degrades an unknown vendor to the always-available fallback (never blocks the clinician)", async () => {
    const jobStore = new InMemoryJobStore({ clock: new FixedClock(), ids: fixedIdGen("job") });
    const out = await ehrSyncActivity(request("valant"), {
      registry: buildRegistry(happyHttp),
      jobStore,
    });
    expect(out.status).toBe("succeeded");
    expect(out.vendor).toBe("valant");
    // The assisted-paste connector produced a stable offline copy reference.
    expect(out.externalNoteId).toMatch(/^copy:/);
  });
});
