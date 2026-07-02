import { describe, it, expect } from "vitest";
import { PromptRegistry } from "./registry.js";
import { defaultPromptRegistry } from "./prompts/index.js";

describe("PromptRegistry", () => {
  it("registers and retrieves by id (latest) or explicit version", () => {
    const reg = new PromptRegistry();
    reg.register({ id: "greet", version: 1, description: "v1", render: () => "hi" });
    reg.register({ id: "greet", version: 2, description: "v2", render: () => "hello" });
    expect(reg.get("greet").ref).toBe("greet@2"); // latest
    expect(reg.get("greet", 1).render({})).toBe("hi");
    expect(reg.latestVersion("greet")).toBe(2);
  });

  it("rejects re-registering the same id@version (forces a version bump)", () => {
    const reg = new PromptRegistry();
    reg.register({ id: "p", version: 1, description: "", render: () => "" });
    expect(() => reg.register({ id: "p", version: 1, description: "", render: () => "" })).toThrow(
      /already registered/,
    );
  });

  it("throws NotFoundError for unknown id/version", () => {
    const reg = new PromptRegistry();
    expect(() => reg.get("missing")).toThrow();
    reg.register({ id: "p", version: 1, description: "", render: () => "" });
    expect(() => reg.get("p", 99)).toThrow();
  });
});

describe("defaultPromptRegistry", () => {
  it("ships note-gen and risk-scan, each rendering a prompt", () => {
    const reg = defaultPromptRegistry();
    const noteGen = reg.get("note-gen");
    expect(noteGen.ref).toBe("note-gen@1");
    expect(noteGen.system).toBeTruthy();
    const rendered = noteGen.render({
      format: "SOAP",
      clientLabel: "S. M. · 32F",
      sections: [{ key: "s", title: "Subjective", guidance: "what the client reports" }],
      transcript: [{ speaker: "client", start: 0, text: "I feel anxious" }],
    });
    expect(rendered).toContain("SOAP");
    expect(rendered).toContain("Subjective");
    expect(rendered).toContain("I feel anxious");

    expect(reg.get("risk-scan").ref).toBe("risk-scan@1");
  });

  it("returns a fresh instance each call (no shared mutable global)", () => {
    expect(defaultPromptRegistry()).not.toBe(defaultPromptRegistry());
  });
});
