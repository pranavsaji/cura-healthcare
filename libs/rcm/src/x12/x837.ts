import { type Claim, claimTotalCents } from "../types.js";
import {
  type ParsedSegment,
  amountToCents,
  assemble,
  centsToAmount,
  d8,
  parseSegments,
  seg,
} from "./segments.js";

/**
 * 837P (professional claim) codec — a faithful, simplified subset: a real
 * ISA/GS/ST envelope, BHT, submitter/receiver + billing/subscriber/payer NM1s,
 * CLM, HI (diagnoses), and SV1 service lines, with correct control numbers and a
 * self-consistent SE segment count. `build` → EDI, `parse` → back to the key
 * claim fields (round-trip), `validate` → structural + envelope integrity.
 */
export interface BuildOptions {
  submitterId?: string;
  receiverId?: string;
  /** Interchange control number (9 digits). Deterministic input for tests. */
  controlNumber?: string;
  /** Interchange date (YYYYMMDD) + time (HHMM) — injected for determinism. */
  date?: string;
  time?: string;
}

export function build837(claim: Claim, opts: BuildOptions = {}): string {
  const submitterId = (opts.submitterId ?? "CURA").padEnd(15).slice(0, 15);
  const receiverId = (opts.receiverId ?? claim.payerId).padEnd(15).slice(0, 15);
  const ctrl = (opts.controlNumber ?? "000000001").padStart(9, "0");
  const date = opts.date ?? d8(claim.serviceDate);
  const time = opts.time ?? "1200";
  const yymmdd = date.slice(2);

  const transaction: string[] = [];
  transaction.push(seg("ST", "837", "0001", "005010X222A1"));
  transaction.push(seg("BHT", "0019", "00", claim.id, date, time, "CH"));
  // Submitter / receiver.
  transaction.push(seg("NM1", "41", "2", "CURA HEALTH", "", "", "", "", "46", submitterId.trim()));
  transaction.push(seg("NM1", "40", "2", claim.payerName, "", "", "", "", "46", receiverId.trim()));
  // Billing provider hierarchical level.
  transaction.push(seg("HL", "1", "", "20", "1"));
  transaction.push(seg("NM1", "85", "2", claim.providerName, "", "", "", "", "XX", claim.npi));
  // Subscriber level.
  transaction.push(seg("HL", "2", "1", "22", "0"));
  transaction.push(seg("SBR", "P", "18", "", "", "", "", "", "", "CI"));
  transaction.push(seg("NM1", "IL", "1", claim.patientLastName, claim.patientFirstName, "", "", "", "MI", claim.memberId));
  transaction.push(seg("NM1", "PR", "2", claim.payerName, "", "", "", "", "PI", claim.payerId));
  // Claim.
  const totalAmount = centsToAmount(claimTotalCents(claim));
  const pos = claim.serviceLines[0]?.placeOfService ?? "11";
  transaction.push(seg("CLM", claim.id, totalAmount, "", "", `${pos}:B:1`, "Y", "A", "Y", "Y"));
  if (claim.priorAuthNumber) transaction.push(seg("REF", "G1", claim.priorAuthNumber));
  if (claim.referringProviderNpi) transaction.push(seg("NM1", "DN", "1", "REFERRING", "", "", "", "", "XX", claim.referringProviderNpi));
  // Diagnoses (HI with ABK/ABF qualifiers).
  const hiElems = claim.diagnoses.map((dx, i) => `${i === 0 ? "ABK" : "ABF"}:${dx}`);
  transaction.push(seg("HI", ...hiElems));
  // Service lines.
  claim.serviceLines.forEach((line, i) => {
    transaction.push(seg("LX", String(i + 1)));
    const proc = ["HC", line.cpt, ...line.modifiers].join(":");
    transaction.push(seg("SV1", proc, centsToAmount(line.chargeCents), "UN", String(line.units), line.placeOfService, "", "1"));
    transaction.push(seg("DTP", "472", "D8", date));
  });

  // SE closes the transaction; its count includes ST..SE inclusive.
  const seCount = transaction.length + 1;
  transaction.push(seg("SE", String(seCount), "0001"));

  const isa = seg(
    "ISA", "00", "".padEnd(10), "00", "".padEnd(10),
    "ZZ", submitterId, "ZZ", receiverId,
    yymmdd, time, "^", "00501", ctrl, "0", "P", ":",
  );
  const gs = seg("GS", "HC", submitterId.trim(), receiverId.trim(), date, time, ctrl.replace(/^0+/, "") || "1", "X", "005010X222A1");
  const ge = seg("GE", "1", ctrl.replace(/^0+/, "") || "1");
  const iea = seg("IEA", "1", ctrl);

  return assemble([isa, gs, ...transaction, ge, iea]);
}

export interface Parsed837 {
  claimId: string;
  payerId: string;
  payerName: string;
  memberId: string;
  npi: string;
  diagnoses: string[];
  serviceLines: { cpt: string; chargeCents: number; units: number; modifiers: string[] }[];
  totalChargeCents: number;
}

/** Parse an 837 back into the key claim fields (enough to round-trip). */
export function parse837(edi: string): Parsed837 {
  const segments = parseSegments(edi);
  const byTag = (tag: string) => segments.filter((s) => s.tag === tag);
  const first = (tag: string): ParsedSegment | undefined => segments.find((s) => s.tag === tag);

  const clm = first("CLM");
  const claimId = clm?.elements[0] ?? first("BHT")?.elements[2] ?? "";
  const totalChargeCents = clm ? amountToCents(clm.elements[1] ?? "0") : 0;

  const nm1 = byTag("NM1");
  const payer = nm1.find((s) => s.elements[0] === "PR");
  const subscriber = nm1.find((s) => s.elements[0] === "IL");
  const provider = nm1.find((s) => s.elements[0] === "85");

  const hi = first("HI");
  const diagnoses = (hi?.elements ?? []).map((e) => e.split(":")[1] ?? "").filter(Boolean);

  const serviceLines = byTag("SV1").map((sv) => {
    const proc = (sv.elements[0] ?? "").split(":");
    return {
      cpt: proc[1] ?? "",
      modifiers: proc.slice(2),
      chargeCents: amountToCents(sv.elements[1] ?? "0"),
      units: Number(sv.elements[3] ?? "1"),
    };
  });

  return {
    claimId,
    payerId: payer?.elements[8] ?? "",
    payerName: payer?.elements[2] ?? "",
    memberId: subscriber?.elements[8] ?? "",
    npi: provider?.elements[8] ?? "",
    diagnoses,
    serviceLines,
    totalChargeCents,
  };
}

export interface ValidationIssue {
  code: string;
  message: string;
}

/** Structural + envelope validation of an 837 interchange. */
export function validate837(edi: string): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const segments = parseSegments(edi);
  const find = (tag: string) => segments.find((s) => s.tag === tag);

  const isa = find("ISA");
  const iea = find("IEA");
  const gs = find("GS");
  const ge = find("GE");
  const st = find("ST");
  const se = find("SE");

  if (!isa || !iea) issues.push({ code: "envelope", message: "missing ISA/IEA interchange envelope" });
  if (!gs || !ge) issues.push({ code: "group", message: "missing GS/GE functional group" });
  if (!st || !se) issues.push({ code: "transaction", message: "missing ST/SE transaction set" });

  // ISA13 (control) must equal IEA02.
  if (isa && iea && isa.elements[12] !== iea.elements[1]) {
    issues.push({ code: "control_isa", message: "ISA/IEA control number mismatch" });
  }
  // GS06 must equal GE02.
  if (gs && ge && gs.elements[5] !== ge.elements[1]) {
    issues.push({ code: "control_gs", message: "GS/GE control number mismatch" });
  }
  // ST02 must equal SE02.
  if (st && se && st.elements[1] !== se.elements[1]) {
    issues.push({ code: "control_st", message: "ST/SE control number mismatch" });
  }
  // SE01 count must equal the number of segments ST..SE inclusive.
  if (st && se) {
    const stIdx = segments.indexOf(st);
    const seIdx = segments.indexOf(se);
    const actual = seIdx - stIdx + 1;
    if (Number(se.elements[0]) !== actual) {
      issues.push({ code: "se_count", message: `SE segment count ${se.elements[0]} ≠ actual ${actual}` });
    }
  }
  // Required content.
  if (!find("CLM")) issues.push({ code: "clm", message: "missing CLM claim segment" });
  if (!segments.some((s) => s.tag === "SV1")) issues.push({ code: "sv1", message: "claim has no service lines" });
  if (!segments.some((s) => s.tag === "NM1" && s.elements[0] === "PR")) {
    issues.push({ code: "payer", message: "missing payer (NM1*PR)" });
  }
  if (!segments.some((s) => s.tag === "NM1" && s.elements[0] === "IL")) {
    issues.push({ code: "subscriber", message: "missing subscriber (NM1*IL)" });
  }

  // Total charge must equal the sum of service-line charges.
  const clm = find("CLM");
  if (clm) {
    const total = amountToCents(clm.elements[1] ?? "0");
    const lineSum = segments
      .filter((s) => s.tag === "SV1")
      .reduce((sum, sv) => sum + amountToCents(sv.elements[1] ?? "0"), 0);
    if (total !== lineSum) {
      issues.push({ code: "balance", message: `CLM total ${total} ≠ service-line sum ${lineSum}` });
    }
  }

  return { valid: issues.length === 0, issues };
}
