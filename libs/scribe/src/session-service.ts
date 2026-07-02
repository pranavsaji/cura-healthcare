import { systemClock, type Clock } from "@cura/core";
import type { AuditLog } from "@cura/audit";
import type { Store, StoreCreateSessionInput } from "@cura/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type Session,
  type SessionStatus,
} from "@cura/shared";

/**
 * Session lifecycle + **consent gating**. This is the single place the status
 * machine and the "consent precedes capture" rule live (CONVENTIONS §6), so no
 * route or worker can start capture without a logged consent event. Every action
 * is tenant-scoped (via the passed {@link Store}) and audited.
 *
 * Status machine: created → recording → transcribing → ready → noted.
 * (Upload/dictation may go created → transcribing directly — no live recording.)
 */
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  created: ["recording", "transcribing"],
  recording: ["transcribing"],
  transcribing: ["ready"],
  ready: ["noted"],
  noted: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return from === to || (TRANSITIONS[from]?.includes(to) ?? false);
}

export interface SessionServiceDeps {
  audit: AuditLog;
  clock?: Clock;
}

export class SessionService {
  private readonly clock: Clock;

  constructor(private readonly deps: SessionServiceDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  /** Create a session and audit it. */
  async create(store: Store, input: StoreCreateSessionInput): Promise<Session> {
    const session = await store.createSession(input);
    await this.audit(store, "session.created", session.id, false, { source: session.source });
    return session;
  }

  /** Fetch a session within the store's tenant, or throw NotFound. */
  async require(store: Store, sessionId: string): Promise<Session> {
    const session = await store.getSession(sessionId);
    // The store is tenant-bound, but double-check the org for defense in depth.
    if (!session || session.orgId !== store.orgId) throw new NotFoundError("session");
    return session;
  }

  /** Log consent (required before any capture). Idempotent-ish: re-consent updates the timestamp. */
  async recordConsent(store: Store, sessionId: string): Promise<Session> {
    await this.require(store, sessionId);
    const updated = await store.updateSession(sessionId, { consentAt: this.clock.nowIso() });
    if (!updated) throw new NotFoundError("session");
    await this.audit(store, "session.consent", sessionId, false);
    return updated;
  }

  /**
   * Begin capture. **Rejected (and audited as a denied attempt) when no consent
   * event exists.** On success transitions to `recording` and stamps `startedAt`.
   */
  async startCapture(store: Store, sessionId: string): Promise<Session> {
    const session = await this.require(store, sessionId);
    if (!session.consentAt) {
      await this.audit(store, "auth.denied", sessionId, false, { reason: "consent_required", action: "session.start" });
      throw new ForbiddenError("consent is required before capture can start");
    }
    this.assertTransition(session.status, "recording");
    const updated = await store.updateSession(sessionId, {
      status: "recording",
      startedAt: session.startedAt ?? this.clock.nowIso(),
    });
    await this.audit(store, "session.started", sessionId, false);
    return updated!;
  }

  /** Enforce consent for a non-live path (upload/dictation batch). */
  async assertConsent(store: Store, sessionId: string): Promise<Session> {
    const session = await this.require(store, sessionId);
    if (!session.consentAt) {
      await this.audit(store, "auth.denied", sessionId, false, { reason: "consent_required", action: "upload" });
      throw new ForbiddenError("consent is required before capture can start");
    }
    return session;
  }

  /** Move to `transcribing` and stamp `endedAt` at the end of capture. */
  async stopCapture(store: Store, sessionId: string): Promise<Session> {
    const session = await this.require(store, sessionId);
    this.assertTransition(session.status, "transcribing");
    const updated = await store.updateSession(sessionId, {
      status: "transcribing",
      endedAt: this.clock.nowIso(),
    });
    await this.audit(store, "session.stopped", sessionId, false);
    return updated!;
  }

  /** Transcript assembled → `ready` (note engine can now run). */
  async markReady(store: Store, sessionId: string): Promise<Session> {
    const session = await this.require(store, sessionId);
    if (session.status === "ready" || session.status === "noted") return session;
    this.assertTransition(session.status, "ready");
    return (await store.updateSession(sessionId, { status: "ready" }))!;
  }

  async status(store: Store, sessionId: string): Promise<SessionStatus> {
    return (await this.require(store, sessionId)).status;
  }

  private assertTransition(from: SessionStatus, to: SessionStatus): void {
    if (!canTransition(from, to)) {
      throw new ConflictError(`invalid session transition ${from} → ${to}`);
    }
  }

  private audit(
    store: Store,
    action: Parameters<AuditLog["record"]>[0]["action"],
    sessionId: string,
    phiTouched: boolean,
    context: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.deps.audit.record({
      orgId: store.orgId,
      actor: store.userId,
      action,
      resource: `session:${sessionId}`,
      phiTouched,
      context,
    });
  }
}
