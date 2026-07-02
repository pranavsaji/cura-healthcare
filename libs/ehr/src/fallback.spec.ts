import { describe, expect, it } from "vitest";
import { isOk } from "@cura/shared";
import { FallbackConnector } from "./adapters/fallback.js";
import type { EhrCredentials } from "./types.js";

const creds: EhrCredentials = { orgId: "org-1", vendor: "fallback", secrets: {} };

describe("FallbackConnector", () => {
  it("never fails and always authenticates", async () => {
    const c = new FallbackConnector();
    expect(isOk(await c.authenticate(creds))).toBe(true);
  });

  it("produces a stable external id per idempotency key (retry-safe copy)", async () => {
    const c = new FallbackConnector();
    const note = { clientLabel: "A", format: "SOAP", text: "x" };
    const r1 = await c.createNote(creds, { externalId: "c", label: "A" }, note, "KEY");
    const r2 = await c.createNote(creds, { externalId: "c", label: "A" }, note, "KEY");
    expect(isOk(r1) && isOk(r2)).toBe(true);
    if (isOk(r1) && isOk(r2)) expect(r1.value.externalId).toBe(r2.value.externalId);
  });

  it("formats a paste-ready copy with the format + label header", () => {
    const text = FallbackConnector.formattedCopy({ clientLabel: "Client A", format: "SOAP", text: "Subjective: ..." });
    expect(text).toContain("SOAP NOTE — Client A");
    expect(text).toContain("Subjective: ...");
  });
});
