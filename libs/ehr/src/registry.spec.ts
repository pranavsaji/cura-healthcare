import { describe, expect, it } from "vitest";
import { NotFoundError } from "@cura/shared";
import { FallbackConnector } from "./adapters/fallback.js";
import type { HttpClient } from "./adapters/simplepractice.js";
import { EhrRegistry, KNOWN_VENDORS } from "./registry.js";

const http: HttpClient = { async request() { return { status: 200, body: {} }; } };

describe("EhrRegistry", () => {
  it("always provides the fallback connector", () => {
    const reg = new EhrRegistry();
    expect(reg.has("fallback")).toBe(true);
    expect(reg.get("fallback")).toBeInstanceOf(FallbackConnector);
  });

  it("resolves the deep adapter when an http client is provided", () => {
    const reg = new EhrRegistry({ http });
    expect(reg.get("simplepractice").vendor).toBe("simplepractice");
  });

  it("throws NotFoundError for an unregistered vendor", () => {
    const reg = new EhrRegistry({ http });
    expect(() => reg.get("does-not-exist")).toThrow(NotFoundError);
  });

  it("getOrFallback degrades unknown vendors to the assisted-paste connector", () => {
    const reg = new EhrRegistry({ http });
    expect(reg.getOrFallback("therapynotes")).toBeInstanceOf(FallbackConnector);
    expect(reg.getOrFallback("simplepractice").vendor).toBe("simplepractice");
  });

  it("lets a vertical register a new vendor without touching callers", () => {
    const reg = new EhrRegistry();
    reg.register("custom", () => new FallbackConnector());
    expect(reg.has("custom")).toBe(true);
  });

  it("exposes the known-vendor catalog", () => {
    expect(KNOWN_VENDORS).toContain("simplepractice");
    expect(KNOWN_VENDORS.length).toBeGreaterThan(5);
  });
});
