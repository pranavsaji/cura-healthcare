import { describe, it, expect } from "vitest";
import { createFlags, FLAG_DEFAULTS } from "./flags.js";

describe("createFlags", () => {
  it("uses registry defaults when nothing is set", () => {
    const flags = createFlags();
    expect(flags.isEnabled("notes.risk-detection")).toBe(FLAG_DEFAULTS["notes.risk-detection"]);
    expect(flags.isEnabled("ehr.auto-sync")).toBe(false);
  });

  it("enables and disables flags from the list", () => {
    const flags = createFlags("ehr.auto-sync, !notes.risk-detection");
    expect(flags.isEnabled("ehr.auto-sync")).toBe(true);
    expect(flags.isEnabled("notes.risk-detection")).toBe(false);
  });

  it("honors a per-call override above env/default", () => {
    const flags = createFlags();
    expect(flags.isEnabled("ehr.auto-sync", true)).toBe(true);
    expect(flags.isEnabled("notes.risk-detection", false)).toBe(false);
  });

  it("throws on an unknown flag name", () => {
    expect(() => createFlags("does.not-exist")).toThrow(/Unknown feature flag/);
  });

  it("exposes a full snapshot", () => {
    const all = createFlags("ehr.auto-sync").all();
    expect(all["ehr.auto-sync"]).toBe(true);
    expect(Object.keys(all).length).toBe(Object.keys(FLAG_DEFAULTS).length);
  });
});
