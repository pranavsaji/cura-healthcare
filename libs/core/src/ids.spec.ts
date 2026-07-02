import { describe, it, expect } from "vitest";
import { uuidIdGen, fixedIdGen } from "./ids.js";

describe("uuidIdGen", () => {
  it("produces unique, optionally-prefixed ids", () => {
    const a = uuidIdGen.next("sess");
    const b = uuidIdGen.next("sess");
    expect(a).not.toBe(b);
    expect(a.startsWith("sess_")).toBe(true);
    expect(uuidIdGen.next()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("fixedIdGen", () => {
  it("is deterministic and monotonic", () => {
    const gen = fixedIdGen("note");
    expect(gen.next()).toBe("note_1");
    expect(gen.next()).toBe("note_2");
    expect(gen.next("sess")).toBe("sess_3");
  });
});
