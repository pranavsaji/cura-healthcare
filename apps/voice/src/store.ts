/**
 * In-memory, tenant-scoped persistence for the front-desk vertical: calls,
 * referrals, appointments. Every record carries `orgId` and every read is
 * filtered by it — there is no cross-tenant path (CONVENTIONS §2). A Postgres
 * implementation (tables `calls`, `referrals`, `appointments`) satisfies the same
 * surface; the app depends on this shape, not the storage.
 */

export interface CallRecord {
  id: string;
  orgId: string;
  from: string;
  to: string;
  receivedAt: string;
  disposition: "in_progress" | "qualified" | "booked" | "declined" | "voicemail";
}

export interface Referral {
  id: string;
  orgId: string;
  callId: string;
  clientLabel: string;
  payerId: string;
  memberId: string;
  reason: string;
  status: "new" | "qualified";
}

export interface AppointmentRecord {
  id: string;
  orgId: string;
  callId: string;
  slotId: string;
  startsAt: string;
  clientLabel: string;
}

export class FrontDeskStore {
  private calls = new Map<string, CallRecord>();
  private referrals = new Map<string, Referral>();
  private appointments = new Map<string, AppointmentRecord>();
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  createCall(input: Omit<CallRecord, "disposition">): CallRecord {
    const call: CallRecord = { ...input, disposition: "in_progress" };
    this.calls.set(call.id, call);
    return call;
  }

  setDisposition(callId: string, disposition: CallRecord["disposition"]): void {
    const call = this.calls.get(callId);
    if (call) call.disposition = disposition;
  }

  addReferral(input: Omit<Referral, "id" | "status">): Referral {
    const ref: Referral = { ...input, id: this.nextId("ref"), status: "qualified" };
    this.referrals.set(ref.id, ref);
    return ref;
  }

  addAppointment(input: Omit<AppointmentRecord, "id">): AppointmentRecord {
    const appt: AppointmentRecord = { ...input, id: this.nextId("appt") };
    this.appointments.set(appt.id, appt);
    return appt;
  }

  // Tenant-scoped reads — always filtered by orgId.
  listCalls(orgId: string): CallRecord[] {
    return [...this.calls.values()].filter((c) => c.orgId === orgId);
  }
  listReferrals(orgId: string): Referral[] {
    return [...this.referrals.values()].filter((r) => r.orgId === orgId);
  }
  listAppointments(orgId: string): AppointmentRecord[] {
    return [...this.appointments.values()].filter((a) => a.orgId === orgId);
  }
}
