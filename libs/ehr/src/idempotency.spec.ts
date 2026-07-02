import { describe, expect, it } from "vitest";
import { idempotencyKey } from "./idempotency.js";

describe("idempotencyKey", () => {
  const base = { orgId: "org-1", noteId: "note-1", vendor: "simplepractice" };

  it("is stable for the same logical write", () => {
    expect(idempotencyKey(base)).toBe(idempotencyKey({ ...base }));
  });

  it("differs across orgs (tenant isolation) — no cross-org collision", () => {
    expect(idempotencyKey(base)).not.toBe(idempotencyKey({ ...base, orgId: "org-2" }));
  });

  it("differs across vendors and notes", () => {
    expect(idempotencyKey(base)).not.toBe(idempotencyKey({ ...base, vendor: "therapynotes" }));
    expect(idempotencyKey(base)).not.toBe(idempotencyKey({ ...base, noteId: "note-2" }));
  });
});
