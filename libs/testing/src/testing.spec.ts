import { describe, it, expect } from "vitest";
import { Session, Note, NoteTemplate } from "@cura/shared";
import { FakeClock, fixedIdGen, makeSession, makeNote, makeTemplate } from "./index.js";

describe("FakeClock", () => {
  it("starts at a fixed instant and advances deterministically", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    clock.advance(1000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:01.000Z");
    clock.set(new Date("2027-06-30T00:00:00.000Z"));
    expect(clock.now().getUTCFullYear()).toBe(2027);
  });
});

describe("fixedIdGen", () => {
  it("produces stable, incrementing ids", () => {
    const gen = fixedIdGen("note");
    expect(gen.next()).toBe("note_1");
    expect(gen.next()).toBe("note_2");
  });
});

describe("factories", () => {
  it("produce objects that satisfy the shared schemas", () => {
    expect(() => Session.parse(makeSession())).not.toThrow();
    expect(() => Note.parse(makeNote())).not.toThrow();
    expect(() => NoteTemplate.parse(makeTemplate())).not.toThrow();
  });

  it("apply overrides", () => {
    expect(makeSession({ status: "recording" }).status).toBe("recording");
    expect(makeNote({ status: "signed" }).status).toBe("signed");
  });
});
