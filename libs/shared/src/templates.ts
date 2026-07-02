import { z } from "zod";

/** Behavioral-health progress-note formats Curanote supports. */
export const NOTE_FORMATS = [
  "SOAP",
  "DAP",
  "BIRP",
  "GIRP",
  "SIRP",
  "PIRP",
  "PIE",
  "CUSTOM",
] as const;
export const NoteFormat = z.enum(NOTE_FORMATS);
export type NoteFormat = z.infer<typeof NoteFormat>;

/** Therapy modalities the scribe is aware of (subset of the 20+). */
export const MODALITIES = [
  "CBT",
  "DBT",
  "EMDR",
  "IFS",
  "ACT",
  "Psychodynamic",
  "Motivational Interviewing",
  "Family Systems",
  "Solution-Focused",
  "Person-Centered",
] as const;

/** A single section of a note template, e.g. "Subjective". */
export const TemplateSection = z.object({
  key: z.string(),
  title: z.string(),
  /** Prompt guidance for the LLM on what belongs in this section. */
  guidance: z.string(),
  /** Ordering hint. */
  order: z.number().int(),
});
export type TemplateSection = z.infer<typeof TemplateSection>;

export const NoteTemplate = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  format: NoteFormat,
  sections: z.array(TemplateSection),
  /** Short exemplars of the clinician's voice/terminology for personalization. */
  styleExamples: z.array(z.string()).default([]),
  modalityHints: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});
export type NoteTemplate = z.infer<typeof NoteTemplate>;

/** Built-in section presets keyed by format, used to seed new orgs. */
export const DEFAULT_SECTIONS: Record<
  Exclude<NoteFormat, "CUSTOM">,
  Omit<TemplateSection, "order">[]
> = {
  SOAP: [
    { key: "subjective", title: "Subjective", guidance: "Client's reported experience, presenting concerns, and history in their own words." },
    { key: "objective", title: "Objective", guidance: "Observable presentation: affect, appearance, behavior, mental status." },
    { key: "assessment", title: "Assessment", guidance: "Clinical interpretation, progress toward goals, diagnostic impressions." },
    { key: "plan", title: "Plan", guidance: "Interventions used, homework, next steps, frequency, referrals." },
  ],
  DAP: [
    { key: "data", title: "Data", guidance: "What happened in session: content, observations, and client statements." },
    { key: "assessment", title: "Assessment", guidance: "Clinical interpretation and progress." },
    { key: "plan", title: "Plan", guidance: "Interventions and next steps." },
  ],
  BIRP: [
    { key: "behavior", title: "Behavior", guidance: "Client's presenting behavior and statements." },
    { key: "intervention", title: "Intervention", guidance: "Clinician's interventions and techniques used." },
    { key: "response", title: "Response", guidance: "Client's response to interventions." },
    { key: "plan", title: "Plan", guidance: "Next steps and follow-up." },
  ],
  GIRP: [
    { key: "goal", title: "Goal", guidance: "Treatment goal(s) addressed this session." },
    { key: "intervention", title: "Intervention", guidance: "Interventions used to address the goal." },
    { key: "response", title: "Response", guidance: "Client response and progress." },
    { key: "plan", title: "Plan", guidance: "Plan and next steps." },
  ],
  SIRP: [
    { key: "situation", title: "Situation", guidance: "Presenting situation and context." },
    { key: "intervention", title: "Intervention", guidance: "Interventions applied." },
    { key: "response", title: "Response", guidance: "Client response." },
    { key: "plan", title: "Plan", guidance: "Plan going forward." },
  ],
  PIRP: [
    { key: "problem", title: "Problem", guidance: "Problem or focus of the session." },
    { key: "intervention", title: "Intervention", guidance: "Interventions used." },
    { key: "response", title: "Response", guidance: "Client response." },
    { key: "plan", title: "Plan", guidance: "Plan and next steps." },
  ],
  PIE: [
    { key: "problem", title: "Problem", guidance: "Problem addressed." },
    { key: "intervention", title: "Intervention", guidance: "Interventions delivered." },
    { key: "evaluation", title: "Evaluation", guidance: "Evaluation of response and progress." },
  ],
};

export function sectionsForFormat(format: NoteFormat): TemplateSection[] {
  if (format === "CUSTOM") return [];
  return DEFAULT_SECTIONS[format].map((s, i) => ({ ...s, order: i }));
}
