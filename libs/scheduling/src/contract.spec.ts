import { describe, expect, it } from "vitest";
import { FixedClock } from "@cura/core";
import { MockScheduler } from "./mock.js";
import type { Scheduler } from "./types.js";

/**
 * Scheduling contract: every adapter must find slots, book idempotently, and
 * return typed Results (never throw for expected failures). New adapters (Google
 * Calendar, EHR-native) get added to `adapters` and must pass unchanged.
 */
const adapters: { name: string; make: () => Scheduler }[] = [
  { name: "mock", make: () => new MockScheduler(new FixedClock()) },
];

describe.each(adapters)("Scheduler contract: $name", ({ make }) => {
  it("finds slots for a valid date", async () => {
    const s = make();
    const res = await s.findSlots({ orgId: "org-1", date: "2026-07-10" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.length).toBeGreaterThan(0);
  });

  it("returns a typed validation error for a bad date (no throw)", async () => {
    const s = make();
    const res = await s.findSlots({ orgId: "org-1", date: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("validation");
  });

  it("books a slot and is idempotent on the same key", async () => {
    const s = make();
    const slots = await s.findSlots({ orgId: "org-1", date: "2026-07-10" });
    const slotId = slots.ok ? slots.value[0]!.id : "";
    const a = await s.book({ orgId: "org-1", slotId, clientLabel: "C" }, "key-1");
    const b = await s.book({ orgId: "org-1", slotId, clientLabel: "C" }, "key-1");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.id).toBe(b.value.id); // same appointment
  });

  it("refuses to double-book a taken slot under a different key", async () => {
    const s = make();
    const slots = await s.findSlots({ orgId: "org-1", date: "2026-07-10" });
    const slotId = slots.ok ? slots.value[0]!.id : "";
    await s.book({ orgId: "org-1", slotId, clientLabel: "C" }, "key-1");
    const clash = await s.book({ orgId: "org-1", slotId, clientLabel: "D" }, "key-2");
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error.kind).toBe("unavailable");
  });
});
