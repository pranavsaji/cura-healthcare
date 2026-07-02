import { describe, it, expect } from "vitest";
import { FixedClock, systemClock } from "./clock.js";

describe("FixedClock", () => {
  it("is deterministic and advances", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    expect(clock.nowIso()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.nowMs()).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
    clock.advance(1000);
    expect(clock.nowIso()).toBe("2026-01-01T00:00:01.000Z");
    expect(clock.now()).toBeInstanceOf(Date);
  });

  it("chains advance calls", () => {
    const clock = new FixedClock(0).advance(500).advance(500);
    expect(clock.nowMs()).toBe(1000);
  });
});

describe("systemClock", () => {
  it("returns a real, monotonic-ish time", () => {
    const before = Date.now();
    const t = systemClock.nowMs();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(typeof systemClock.nowIso()).toBe("string");
  });
});
