import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, PageQuery } from "./pagination.js";

describe("pagination cursors", () => {
  it("round-trips a payload", () => {
    const enc = encodeCursor({ createdAt: "2026-01-01", id: "sess_9" });
    expect(typeof enc).toBe("string");
    expect(decodeCursor(enc)).toEqual({ createdAt: "2026-01-01", id: "sess_9" });
  });

  it("returns null for undefined or malformed cursors", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("!!!not-base64-json!!!")).toBeNull();
  });

  it("PageQuery coerces + defaults + clamps", () => {
    expect(PageQuery.parse({})).toEqual({ limit: 25 });
    expect(PageQuery.parse({ limit: "10" }).limit).toBe(10);
    expect(() => PageQuery.parse({ limit: 1000 })).toThrow();
  });
});
