import {
  DEFAULT_SECTIONS,
  NoteFormat,
  type NoteTemplate,
  type TemplateSection,
  ValidationError,
  sectionsForFormat,
} from "@cura/shared";

/**
 * The template engine turns a *format or a stored template* into the concrete,
 * ordered {@link TemplateSection}[] the note generator writes into. It is
 * data-driven by design (CONVENTIONS §2 / Phase 11 mandate): adding a new note
 * format or a bespoke org template requires **no code change** here — only new
 * section data — so the generator, evidence linker, and editor all work
 * unchanged for any format.
 */

/** A fully-resolved template ready for generation: sections + generation hints. */
export interface ResolvedTemplate {
  /** Stable id of the source template, or the format name for built-ins. */
  id: string;
  format: NoteFormat;
  /** Sections in render order (already sorted, contiguous `order`). */
  sections: TemplateSection[];
  /** Clinician voice exemplars carried on the template (seed personalization). */
  styleExamples: string[];
  /** Modality hints (CBT/DBT/…) injected into the prompt. */
  modalityHints: string[];
}

/** A section skeleton for a custom template (order is assigned if omitted). */
export interface CustomSectionInput {
  key: string;
  title: string;
  guidance: string;
  order?: number;
}

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Validate the sections of a template (built-in or custom). Throws a typed
 * {@link ValidationError} listing every problem so a bad custom template is
 * rejected at the boundary, never silently generated from (CONVENTIONS §3).
 */
export function validateTemplateSections(
  sections: readonly Pick<TemplateSection, "key" | "title" | "guidance">[],
): void {
  const problems: string[] = [];
  if (sections.length === 0) problems.push("a template needs at least one section");

  const seen = new Set<string>();
  for (const [i, s] of sections.entries()) {
    const where = `section[${i}]`;
    if (!s.key || !KEY_RE.test(s.key)) {
      problems.push(`${where}: key "${s.key}" must be snake_case (matching ${KEY_RE})`);
    } else if (seen.has(s.key)) {
      problems.push(`${where}: duplicate key "${s.key}" — section keys must be unique`);
    } else {
      seen.add(s.key);
    }
    if (!s.title?.trim()) problems.push(`${where}: title is required`);
    if (!s.guidance?.trim()) problems.push(`${where}: guidance is required (tells the model what belongs here)`);
  }

  if (problems.length) {
    throw new ValidationError(`invalid note template: ${problems.join("; ")}`, {
      details: { problems },
    });
  }
}

/** Normalize sections into contiguous, ascending `order` starting at 0. */
function normalizeOrder(sections: CustomSectionInput[]): TemplateSection[] {
  return sections
    .map((s, i) => ({ ...s, order: s.order ?? i }))
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ key: s.key, title: s.title, guidance: s.guidance, order: i }));
}

/**
 * Resolve a built-in format to its default section schema. `CUSTOM` has no
 * built-in sections and must be resolved from a stored template instead.
 */
export function resolveFormat(format: NoteFormat): ResolvedTemplate {
  const parsed = NoteFormat.parse(format);
  if (parsed === "CUSTOM") {
    throw new ValidationError("CUSTOM format has no built-in sections — provide a template");
  }
  const sections = sectionsForFormat(parsed);
  return { id: parsed, format: parsed, sections, styleExamples: [], modalityHints: [] };
}

/**
 * Resolve a stored {@link NoteTemplate} (any format, incl. custom) into a
 * {@link ResolvedTemplate}. A custom template supplies its own sections; a
 * built-in template may omit them, in which case the format defaults are used.
 * Validates section shape before returning.
 */
export function resolveTemplate(template: NoteTemplate): ResolvedTemplate {
  const format = NoteFormat.parse(template.format);
  let sections: TemplateSection[];

  if (template.sections.length > 0) {
    validateTemplateSections(template.sections);
    sections = normalizeOrder(template.sections);
  } else if (format === "CUSTOM") {
    throw new ValidationError(`custom template "${template.id}" has no sections`);
  } else {
    sections = sectionsForFormat(format);
  }

  return {
    id: template.id,
    format,
    sections,
    styleExamples: template.styleExamples ?? [],
    modalityHints: template.modalityHints ?? [],
  };
}

/**
 * Build a `CUSTOM` resolved template from raw section inputs (used when an org
 * defines a new format at runtime). Validates + orders the sections.
 */
export function buildCustomTemplate(
  id: string,
  sections: CustomSectionInput[],
  opts: { styleExamples?: string[]; modalityHints?: string[] } = {},
): ResolvedTemplate {
  validateTemplateSections(sections);
  return {
    id,
    format: "CUSTOM",
    sections: normalizeOrder(sections),
    styleExamples: opts.styleExamples ?? [],
    modalityHints: opts.modalityHints ?? [],
  };
}

/** Every non-custom format the engine can resolve with zero configuration. */
export const BUILTIN_FORMATS = Object.keys(DEFAULT_SECTIONS) as Exclude<NoteFormat, "CUSTOM">[];
