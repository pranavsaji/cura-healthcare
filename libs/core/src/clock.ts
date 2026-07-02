/**
 * Time abstraction. All downstream logic that needs "now" takes a `Clock` so it
 * is deterministically testable — no direct `new Date()` / `Date.now()` in domain
 * code. `@cura/testing`'s `FakeClock` satisfies this same structural interface.
 */
export interface Clock {
  /** Current wall-clock time. */
  now(): Date;
  /** Current time in epoch milliseconds (convenience). */
  nowMs(): number;
  /** ISO-8601 string of the current time (what we persist). */
  nowIso(): string;
}

/** Production clock backed by the system time source. */
export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

/**
 * Deterministic clock for tests/seeds. Mirrors `@cura/testing`'s FakeClock but
 * lives in core so non-test code (e.g. a fixed-time seed) can use it too.
 */
export class FixedClock implements Clock {
  private current: number;

  constructor(start: Date | number | string = "2026-01-01T00:00:00.000Z") {
    this.current =
      typeof start === "number"
        ? start
        : (typeof start === "string" ? new Date(start) : start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }
  nowMs(): number {
    return this.current;
  }
  nowIso(): string {
    return new Date(this.current).toISOString();
  }

  /** Advance the clock by `ms` milliseconds (chainable). */
  advance(ms: number): this {
    this.current += ms;
    return this;
  }
}
