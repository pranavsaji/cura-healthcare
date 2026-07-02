import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  TranscriptSegment,
  NoteSection,
  RiskFlag,
  TemplateSection,
} from "@cura/shared";

/**
 * Multi-tenant behavioral-health platform schema.
 * Every domain row carries `orgId` for strict row-level tenant isolation.
 * PII/PHI columns would be envelope-encrypted at the application layer in prod.
 */

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workosOrgId: text("workos_org_id"),
  name: text("name").notNull(),
  dataResidency: text("data_residency").default("us").notNull(),
  retentionDays: integer("retention_days").default(3650).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),
    workosUserId: text("workos_user_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    // owner | admin | clinician | frontdesk | biller
    role: text("role").default("clinician").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_org_idx").on(t.orgId)],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),
    // encrypted at app layer in prod
    displayLabel: text("display_label").notNull(),
    mrn: text("mrn"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("clients_org_idx").on(t.orgId)],
);

export const noteTemplates = pgTable(
  "note_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),
    name: text("name").notNull(),
    format: text("format").notNull(),
    sections: jsonb("sections").$type<TemplateSection[]>().notNull(),
    styleExamples: jsonb("style_examples").$type<string[]>().default([]).notNull(),
    modalityHints: jsonb("modality_hints").$type<string[]>().default([]).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("templates_org_idx").on(t.orgId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),
    clinicianId: uuid("clinician_id")
      .references(() => users.id)
      .notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    clientLabel: text("client_label").notNull(),
    templateId: uuid("template_id").references(() => noteTemplates.id),
    modality: text("modality"),
    source: text("source").default("live").notNull(),
    status: text("status").default("created").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_org_idx").on(t.orgId), index("sessions_clinician_idx").on(t.clinicianId)],
);

export const recordings = pgTable("recordings", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id)
    .notNull(),
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
  storageKey: text("storage_key").notNull(),
  durationSec: integer("duration_sec"),
  checksum: text("checksum"),
  retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id)
    .notNull(),
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
  segments: jsonb("segments").$type<TranscriptSegment[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),
    sessionId: uuid("session_id")
      .references(() => sessions.id)
      .notNull(),
    templateId: uuid("template_id").references(() => noteTemplates.id),
    format: text("format").notNull(),
    sections: jsonb("sections").$type<NoteSection[]>().default([]).notNull(),
    riskFlags: jsonb("risk_flags").$type<RiskFlag[]>().default([]).notNull(),
    status: text("status").default("draft").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notes_org_idx").on(t.orgId), index("notes_session_idx").on(t.sessionId)],
);

/** Append-only edit diffs → personalization signal. */
export const noteEdits = pgTable("note_edits", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id)
    .notNull(),
  noteId: uuid("note_id")
    .references(() => notes.id)
    .notNull(),
  sectionKey: text("section_key").notNull(),
  before: text("before").notNull(),
  after: text("after").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Immutable, hash-chained audit log powering observability + replay. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    phiTouched: boolean("phi_touched").default(false).notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().default({}).notNull(),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_org_idx").on(t.orgId)],
);

/* -------------------------------------------------------------------------- */
/* Curabill (Phase 18) — RCM tables. All tenant-scoped by `orgId`.            */
/* -------------------------------------------------------------------------- */

/** Payer master (pre-loaded: 5,000+ payers in prod). */
export const payers = pgTable(
  "payers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    externalPayerId: text("external_payer_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("payers_org_idx").on(t.orgId)],
);

/** Per-payer, per-tenant rules (learnable — sharpened by the learning loop). */
export const payerRules = pgTable(
  "payer_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    payerId: text("payer_id").notNull(),
    // Serialized PayerRule[] from @cura/rcm.
    rules: jsonb("rules").$type<Record<string, unknown>[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("payer_rules_org_idx").on(t.orgId)],
);

export const eligibilityChecks = pgTable(
  "eligibility_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    payerId: text("payer_id").notNull(),
    // Envelope-encrypted PII in prod.
    memberId: text("member_id").notNull(),
    active: boolean("active").notNull(),
    priorAuthRequired: boolean("prior_auth_required").default(false).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("eligibility_org_idx").on(t.orgId)],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    externalClaimId: text("external_claim_id").notNull(),
    payerId: text("payer_id").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id),
    totalChargeCents: integer("total_charge_cents").notNull(),
    // draft | needs_correction | awaiting_approval | submitted | paid | denied
    status: text("status").default("draft").notNull(),
    // Raw 837 EDI (PHI — encrypted at rest).
    edi837: text("edi_837"),
    traceNumber: text("trace_number"),
    approvedBy: text("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("claims_org_idx").on(t.orgId), index("claims_status_idx").on(t.status)],
);

export const remittances = pgTable(
  "remittances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    payerId: text("payer_id").notNull(),
    checkOrEftNumber: text("check_or_eft_number").notNull(),
    paymentCents: integer("payment_cents").notNull(),
    // Parsed 835 lines (RemittanceLine[]).
    lines: jsonb("lines").$type<Record<string, unknown>[]>().default([]).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("remittances_org_idx").on(t.orgId)],
);

export const denials = pgTable(
  "denials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    claimId: uuid("claim_id").references(() => claims.id),
    carc: text("carc").notNull(),
    rarc: jsonb("rarc").$type<string[]>().default([]).notNull(),
    amountCents: integer("amount_cents").notNull(),
    category: text("category").notNull(),
    // new | appeal_drafted | appeal_submitted | resolved
    status: text("status").default("new").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("denials_org_idx").on(t.orgId)],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type NoteTemplateRow = typeof noteTemplates.$inferSelect;
export type TranscriptRow = typeof transcripts.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type RemittanceRow = typeof remittances.$inferSelect;
export type DenialRow = typeof denials.$inferSelect;
export type PayerRow = typeof payers.$inferSelect;
