import type { Role } from "@cura/shared";

/**
 * Infrastructure-level domain shapes for aggregates that don't yet have a
 * canonical schema in `@cura/shared` (org/user/client). Repositories return
 * these mapped shapes — never raw Drizzle row types — so callers stay decoupled
 * from the ORM. PII fields (`displayLabel`, `mrn`) are already decrypted here.
 */

export interface Org {
  id: string;
  name: string;
  workosOrgId: string | null;
  dataResidency: string;
  retentionDays: number;
  createdAt: string;
}

export interface Member {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  workosUserId: string | null;
  createdAt: string;
}

export interface ClientRecord {
  id: string;
  orgId: string;
  displayLabel: string;
  mrn: string | null;
  createdAt: string;
}
