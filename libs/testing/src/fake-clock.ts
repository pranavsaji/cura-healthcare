/**
 * Deterministic clock for tests. Satisfies the structural `Clock` interface that
 * `@cura/core` will define in Phase 04 (`now(): Date`), so downstream code that
 * accepts a Clock can be driven without real time.
 */
export interface Clock {
  now(): Date;
}

export class FakeClock implements Clock {
  private current: number;

  constructor(start: Date | number = new Date("2026-01-01T00:00:00.000Z")) {
    this.current = typeof start === "number" ? start : start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  /** Advance the clock by `ms` milliseconds. */
  advance(ms: number): void {
    this.current += ms;
  }

  /** Set the clock to an absolute time. */
  set(to: Date | number): void {
    this.current = typeof to === "number" ? to : to.getTime();
  }
}
