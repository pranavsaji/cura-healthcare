import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOr } from "./result.js";

describe("Result", () => {
  it("constructs ok/err and narrows", () => {
    const good = ok(42);
    const bad = err("nope");
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    if (isOk(good)) expect(good.value).toBe(42);
    if (isErr(bad)) expect(bad.error).toBe("nope");
  });

  it("map transforms only ok", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err<string>("e"), (n: number) => n * 3)).toEqual(err("e"));
  });

  it("mapErr transforms only err", () => {
    expect(mapErr(err("e"), (s) => s.toUpperCase())).toEqual(err("E"));
    expect(mapErr(ok(1), (s: string) => s)).toEqual(ok(1));
  });

  it("unwrapOr returns fallback on err", () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err("e"), 9)).toBe(9);
  });

  it("unwrap throws on err", () => {
    expect(unwrap(ok(5))).toBe(5);
    expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
  });
});
