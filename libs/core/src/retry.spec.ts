import { describe, it, expect, vi } from "vitest";
import { withRetry, RetryError } from "./retry.js";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    const fn = vi.fn(async () => 42);
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return "ok";
      },
      { attempts: 3, sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws a typed RetryError after exhausting attempts", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(withRetry(fn, { attempts: 4, sleep: noSleep })).rejects.toBeInstanceOf(RetryError);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not retry when the error is non-retryable", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      withRetry(fn, { attempts: 5, sleep: noSleep, retryable: () => false }),
    ).rejects.toBeInstanceOf(RetryError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("computes bounded, jittered backoff delays", async () => {
    const delays: number[] = [];
    await withRetry(
      async () => {
        throw new Error("x");
      },
      {
        attempts: 4,
        baseMs: 100,
        factor: 2,
        maxDelayMs: 300,
        jitter: 0,
        random: () => 0.5,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    ).catch(() => undefined);
    // 100, 200, then capped at 300 (400 → 300). No sleep after the last attempt.
    expect(delays).toEqual([100, 200, 300]);
  });
});
