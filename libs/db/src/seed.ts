import { NOTE_FORMATS, sectionsForFormat, type NoteFormat } from "@cura/shared";
import { FixedClock, fixedIdGen } from "@cura/core";
import type { Database } from "./client.js";
import { createRepositories, type Repositories } from "./repositories/index.js";
import { createEncryptor, staticKeyProvider } from "./encryption.js";

/**
 * Deterministic dev seed: one org, a clinician + admin, a couple of clients, and
 * the default note templates for every supported format. Fixed UUIDs so other
 * phases and e2e tests can reference known ids. Safe to run repeatedly against a
 * fresh DB; not idempotent by design (call on a clean database).
 */

/** Stable UUIDs so downstream fixtures can hardcode references. */
export const SEED_IDS = {
  org: "00000000-0000-4000-8000-000000000001",
  admin: "00000000-0000-4000-8000-000000000002",
  clinician: "00000000-0000-4000-8000-000000000003",
  clientA: "00000000-0000-4000-8000-000000000004",
  clientB: "00000000-0000-4000-8000-000000000005",
} as const;

const SEED_KEY = "seed-encryption-key-not-for-prod";

export interface SeedResult {
  orgId: string;
  clinicianId: string;
  templateIds: Record<string, string>;
}

/** Populate `db` with the deterministic dev dataset. */
export async function seed(db: Database, encryptionKey = SEED_KEY): Promise<SeedResult> {
  const repos: Repositories = createRepositories(db, {
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: fixedIdGen("seed"),
    encryptor: createEncryptor(staticKeyProvider(encryptionKey)),
  });

  await repos.orgs.create({
    id: SEED_IDS.org,
    name: "Bright Path Behavioral Health",
    dataResidency: "us",
    retentionDays: 3650,
  });

  await repos.users.create(SEED_IDS.org, {
    id: SEED_IDS.admin,
    email: "admin@brightpath.example",
    name: "Alex Owner",
    role: "admin",
  });
  await repos.users.create(SEED_IDS.org, {
    id: SEED_IDS.clinician,
    email: "dr.rivera@brightpath.example",
    name: "Dr. Sam Rivera",
    role: "clinician",
  });

  await repos.clients.create(SEED_IDS.org, {
    id: SEED_IDS.clientA,
    displayLabel: "S. Mitchell · 32F",
    mrn: "MRN-1001",
  });
  await repos.clients.create(SEED_IDS.org, {
    id: SEED_IDS.clientB,
    displayLabel: "J. Okafor · 45M",
    mrn: "MRN-1002",
  });

  const templateIds: Record<string, string> = {};
  for (const format of NOTE_FORMATS.filter(
    (f): f is Exclude<NoteFormat, "CUSTOM"> => f !== "CUSTOM",
  )) {
    const tmpl = await repos.templates.create(SEED_IDS.org, {
      name: `${format} — Progress Note`,
      format,
      sections: sectionsForFormat(format),
      styleExamples: [],
      modalityHints: [],
      isDefault: format === "SOAP",
    });
    templateIds[format] = tmpl.id;
  }

  return { orgId: SEED_IDS.org, clinicianId: SEED_IDS.clinician, templateIds };
}
