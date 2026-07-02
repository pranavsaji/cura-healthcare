import { ok, err } from "@cura/shared";
import type { Clock } from "@cura/core";
import { systemClock } from "@cura/core";
import {
  type Appointment,
  type BookRequest,
  type Scheduler,
  type SchedulingResult,
  type Slot,
  type SlotQuery,
  schedulingError,
} from "./types.js";

/**
 * Deterministic in-memory {@link Scheduler} for offline dev/tests. Generates a
 * fixed grid of slots per day and books them idempotently. All state is
 * `orgId`-scoped. A real adapter (Google Calendar / EHR) implements the same
 * interface + passes the same contract test.
 */
export class MockScheduler implements Scheduler {
  readonly name = "mock";
  private readonly booked = new Map<string, Appointment>(); // slotId → appt
  private readonly byKey = new Map<string, Appointment>(); // idempotencyKey → appt

  constructor(
    private readonly clock: Clock = systemClock,
    /** Clinician ids to schedule against (default one). */
    private readonly clinicians: string[] = ["clinician-1"],
  ) {}

  async findSlots(query: SlotQuery): Promise<SchedulingResult<Slot[]>> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      return err(schedulingError("validation", `bad date "${query.date}"`));
    }
    const duration = query.durationMin ?? 60;
    const clinicians = query.clinicianId ? [query.clinicianId] : this.clinicians;
    const slots: Slot[] = [];
    // 9:00–15:00 grid, hourly.
    for (const clinicianId of clinicians) {
      for (let hour = 9; hour < 15; hour++) {
        const id = `${query.date}_${clinicianId}_${hour}`;
        if (this.booked.has(id)) continue;
        slots.push({
          id,
          startsAt: `${query.date}T${String(hour).padStart(2, "0")}:00:00.000Z`,
          durationMin: duration,
          clinicianId,
        });
      }
    }
    return ok(slots);
  }

  async book(request: BookRequest, idempotencyKey: string): Promise<SchedulingResult<Appointment>> {
    // Idempotency: same key → same appointment (retry-safe).
    const existing = this.byKey.get(idempotencyKey);
    if (existing) return ok(existing);

    if (this.booked.has(request.slotId)) {
      return err(schedulingError("unavailable", `slot ${request.slotId} already booked`));
    }
    const startsAt = request.slotId.includes("_")
      ? `${request.slotId.split("_")[0]}T${String(request.slotId.split("_")[2]).padStart(2, "0")}:00:00.000Z`
      : this.clock.nowIso();
    const appt: Appointment = {
      id: `appt_${idempotencyKey}`,
      orgId: request.orgId,
      slotId: request.slotId,
      startsAt,
      clientLabel: request.clientLabel,
      status: "booked",
    };
    this.booked.set(request.slotId, appt);
    this.byKey.set(idempotencyKey, appt);
    return ok(appt);
  }
}
