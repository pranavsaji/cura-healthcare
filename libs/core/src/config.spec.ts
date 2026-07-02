import { describe, it, expect } from "vitest";
import { loadConfig, redactConfig, ConfigError } from "./config.js";

const MIN_ENV = { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef" };

describe("loadConfig", () => {
  it("applies dev-safe defaults with a minimal valid env", () => {
    const c = loadConfig(MIN_ENV);
    expect(c.NODE_ENV).toBe("development");
    expect(c.API_PORT).toBe(4100);
    expect(c.ASR_PROVIDER).toBe("mock");
    expect(c.LLM_PROVIDER).toBe("mock");
    expect(c.RETENTION_DAYS).toBe(3650);
  });

  it("throws a ConfigError listing missing required vars on empty env", () => {
    try {
      loadConfig({});
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.issues.some((i) => i.startsWith("ENCRYPTION_KEY"))).toBe(true);
      expect(err.message).toContain("Invalid configuration");
    }
  });

  it("requires a provider key when the provider is not mock", () => {
    try {
      loadConfig({ ...MIN_ENV, LLM_PROVIDER: "anthropic" });
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as ConfigError;
      expect(err.issues.some((i) => i.startsWith("ANTHROPIC_API_KEY"))).toBe(true);
    }
  });

  it("requires DATABASE_URL and SESSION_SECRET in production", () => {
    expect(() => loadConfig({ ...MIN_ENV, NODE_ENV: "production" })).toThrow(ConfigError);
    // DB present but SESSION_SECRET still missing → still invalid.
    expect(() =>
      loadConfig({
        ...MIN_ENV,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://u:p@localhost:5432/db",
      }),
    ).toThrow(ConfigError);
    // Both present → valid.
    expect(() =>
      loadConfig({
        ...MIN_ENV,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://u:p@localhost:5432/db",
        SESSION_SECRET: "prod-session-secret-32-chars-min!",
      }),
    ).not.toThrow();
  });

  it("coerces numeric and rejects invalid enums", () => {
    const c = loadConfig({ ...MIN_ENV, API_PORT: "5000" });
    expect(c.API_PORT).toBe(5000);
    expect(() => loadConfig({ ...MIN_ENV, ASR_PROVIDER: "whisper" })).toThrow(ConfigError);
  });
});

describe("redactConfig", () => {
  it("never exposes secret values", () => {
    const c = loadConfig({ ...MIN_ENV, ANTHROPIC_API_KEY: "sk-secret" });
    const red = redactConfig(c);
    expect(red.ENCRYPTION_KEY).toBe("[redacted]");
    expect(red.ANTHROPIC_API_KEY).toBe("[redacted]");
    expect(red.API_PORT).toBe(4100);
    expect(JSON.stringify(red)).not.toContain("0123456789abcdef");
  });
});
