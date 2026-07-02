import { describe, expect, it } from "vitest";
import { AppError, ValidationError, type NoteTemplate } from "@cura/shared";
import {
  BUILTIN_FORMATS,
  buildCustomTemplate,
  resolveFormat,
  resolveTemplate,
  validateTemplateSections,
} from "./template-engine.js";

describe("template-engine", () => {
  it("resolves all built-in formats to non-empty, ordered sections (no code per format)", () => {
    for (const format of BUILTIN_FORMATS) {
      const t = resolveFormat(format);
      expect(t.format).toBe(format);
      expect(t.sections.length).toBeGreaterThan(0);
      // order is contiguous and ascending
      t.sections.forEach((s, i) => expect(s.order).toBe(i));
    }
  });

  it("refuses to resolve CUSTOM without a template", () => {
    expect(() => resolveFormat("CUSTOM")).toThrow(ValidationError);
  });

  it("resolves a stored custom template from its own sections", () => {
    const template: NoteTemplate = {
      id: "tmpl-1",
      orgId: "org-1",
      name: "My Format",
      format: "CUSTOM",
      sections: [
        { key: "narrative", title: "Narrative", guidance: "What happened.", order: 0 },
        { key: "plan", title: "Plan", guidance: "Next steps.", order: 1 },
      ],
      styleExamples: ["Client engaged well."],
      modalityHints: ["CBT"],
      isDefault: false,
    };
    const resolved = resolveTemplate(template);
    expect(resolved.sections.map((s) => s.key)).toEqual(["narrative", "plan"]);
    expect(resolved.styleExamples).toEqual(["Client engaged well."]);
    expect(resolved.modalityHints).toEqual(["CBT"]);
  });

  it("falls back to format defaults when a built-in template omits sections", () => {
    const template: NoteTemplate = {
      id: "tmpl-soap",
      orgId: "org-1",
      name: "SOAP",
      format: "SOAP",
      sections: [],
      styleExamples: [],
      modalityHints: [],
      isDefault: true,
    };
    const resolved = resolveTemplate(template);
    expect(resolved.sections.map((s) => s.key)).toEqual(["subjective", "objective", "assessment", "plan"]);
  });

  it("throws on a custom template with no sections", () => {
    const template: NoteTemplate = {
      id: "tmpl-empty",
      orgId: "org-1",
      name: "Empty",
      format: "CUSTOM",
      sections: [],
      styleExamples: [],
      modalityHints: [],
      isDefault: false,
    };
    expect(() => resolveTemplate(template)).toThrow(/no sections/);
  });

  describe("validateTemplateSections", () => {
    it("rejects duplicate keys, bad keys, and missing guidance in one pass", () => {
      let caught: unknown;
      try {
        validateTemplateSections([
          { key: "Good", title: "Bad Key", guidance: "x" }, // bad key (uppercase)
          { key: "dup", title: "One", guidance: "x" },
          { key: "dup", title: "Two", guidance: "x" }, // duplicate
          { key: "no_guide", title: "Missing", guidance: "" }, // missing guidance
        ]);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      const details = (caught as AppError).details as { problems: string[] };
      expect(details.problems.length).toBeGreaterThanOrEqual(3);
    });

    it("rejects an empty section list", () => {
      expect(() => validateTemplateSections([])).toThrow(/at least one section/);
    });

    it("accepts a well-formed section list", () => {
      expect(() => validateTemplateSections([{ key: "a", title: "A", guidance: "g" }])).not.toThrow();
    });
  });

  it("buildCustomTemplate validates + normalizes order", () => {
    const t = buildCustomTemplate("c1", [
      { key: "b", title: "B", guidance: "g", order: 5 },
      { key: "a", title: "A", guidance: "g", order: 2 },
    ]);
    expect(t.sections.map((s) => s.key)).toEqual(["a", "b"]);
    expect(t.sections.map((s) => s.order)).toEqual([0, 1]);
    expect(() => buildCustomTemplate("c2", [{ key: "BAD KEY", title: "x", guidance: "g" }])).toThrow();
  });
});
