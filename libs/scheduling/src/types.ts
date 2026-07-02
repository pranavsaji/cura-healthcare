import type { Result } from "@cura/shared";

/**
 * The scheduling capability behind one interface — calendar/EHR schedulers vary
 * wildly, so adapters (mock, Google Calendar, EHR-native) all satisfy this shape
 * + a contract test (Phase 17 mandate). Booking is a SIDE EFFECT: it takes an
 * `idempotencyKey` so a retried book never double-books, and returns a typed
 * {@link SchedulingError} inside a {@link Result} (never throws for expected
 * failures — CONVENTIONS §3).
 */

export type SchedulingErrorKind =
  | "unavailable" // slot taken / provider down — retryable
  | "not_found" // clinician/location not found — not retryable
  | "validation" // bad request — not retryable
  | "conflict"; // idempotency conflict — treated as success upstream

export interface SchedulingError {
  kind: SchedulingErrorKind;
  message: string;
  retryable: boolean;
}

export type SchedulingResult<T> = Result<T, SchedulingError>;

export interface SlotQuery {
  orgId: string;
  /** ISO date (YYYY-MM-DD) to search within. */
  date: string;
  clinicianId?: string;
  /** Requested visit length in minutes (default 60). */
  durationMin?: number;
}

export interface Slot {
  /** Stable slot id used to book. */
  id: string;
  startsAt: string; // ISO
  durationMin: number;
  clinicianId: string;
}

export interface BookRequest {
  orgId: string;
  slotId: string;
  clientLabel: string;
  reason?: string;
}

export interface Appointment {
  id: string;
  orgId: string;
  slotId: string;
  startsAt: string;
  clientLabel: string;
  status: "booked" | "cancelled";
}

export interface Scheduler {
  readonly name: string;
  /** Find open slots (read; safe to call freely). */
  findSlots(query: SlotQuery): Promise<SchedulingResult<Slot[]>>;
  /** Book a slot (SIDE EFFECT). Idempotent by `idempotencyKey`. */
  book(request: BookRequest, idempotencyKey: string): Promise<SchedulingResult<Appointment>>;
}

export function schedulingError(
  kind: SchedulingErrorKind,
  message: string,
  retryable = kind === "unavailable",
): SchedulingError {
  return { kind, message, retryable };
}
