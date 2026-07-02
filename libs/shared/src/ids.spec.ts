import { describe, it, expect } from "vitest";
import { asOrgId, asNoteId, type OrgId, type NoteId } from "./ids.js";

describe("branded ids", () => {
  it("wrap plain strings at runtime", () => {
    const org = asOrgId("org_1");
    const note = asNoteId("note_1");
    expect(org).toBe("org_1");
    expect(note).toBe("note_1");
  });

  it("brands are compile-time only (documented by usage)", () => {
    // The following would be a *type* error if uncommented — brands prevent mixing:
    //   const n: NoteId = asOrgId("org_1");
    const org: OrgId = asOrgId("org_1");
    const note: NoteId = asNoteId("note_1");
    expect(`${org}/${note}`).toBe("org_1/note_1");
  });
});
