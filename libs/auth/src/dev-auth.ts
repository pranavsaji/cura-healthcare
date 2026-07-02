import { SEED_IDS } from "@cura/db";
import type { Role } from "@cura/shared";
import type { AuthProvider } from "./provider.js";
import type { SessionSubject } from "./session.js";

/**
 * DEV auth provider: no WorkOS account needed. Returns a subject for a seeded
 * user (Phase 03 seed) so local work and tests get a real {@link TenantContext}
 * with zero external config. Selected automatically when `AUTH_PROVIDER=mock`
 * (the default) — see {@link selectAuthProvider}.
 *
 * Defaults to the seeded **admin** so a developer can exercise every route
 * locally; override the subject to test a narrower role.
 */
export class DevAuthProvider implements AuthProvider {
  readonly kind = "dev" as const;
  private readonly subject: SessionSubject;

  constructor(subject?: Partial<SessionSubject> & { role?: Role }) {
    this.subject = {
      userId: subject?.userId ?? SEED_IDS.admin,
      orgId: subject?.orgId ?? SEED_IDS.org,
      role: subject?.role ?? "admin",
      ...(subject?.sessionId ? { sessionId: subject.sessionId } : {}),
    };
  }

  async devSubject(): Promise<SessionSubject> {
    return { ...this.subject };
  }
}
