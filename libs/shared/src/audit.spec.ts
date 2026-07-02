import { describe, it, expect } from "vitest";
import { AuditEvent, AuditInput, AuditAction } from "./audit.js";

describe("audit schemas", () => {
  it("accepts a valid audit event", () => {
    const ev = {
      id: "aud_1",
      orgId: "org_1",
      actor: "user_1",
      action: "note.signed",
      resource: "note:note_1",
      phiTouched: false,
      context: { noteId: "note_1" },
      prevHash: null,
      hash: "abc",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(() => AuditEvent.parse(ev)).not.toThrow();
  });

  it("rejects an unknown action", () => {
    expect(() => AuditAction.parse("note.teleported")).toThrow();
  });

  it("AuditInput defaults phiTouched + context", () => {
    const parsed = AuditInput.parse({
      orgId: "org_1",
      actor: "system",
      action: "session.created",
      resource: "session:sess_1",
    });
    expect(parsed.phiTouched ?? false).toBe(false);
  });
});
