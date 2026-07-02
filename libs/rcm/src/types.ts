import { z } from "zod";

/**
 * The RCM domain model (Phase 18). Money is always in **integer cents** inside
 * the system (no float drift); X12 codecs convert to/from decimal dollars at the
 * boundary. Every entity carries `orgId` — claims, remittances, denials, and the
 * learning loop are all tenant-scoped (CONVENTIONS §2).
 */

export const ServiceLine = z.object({
  /** CPT/HCPCS procedure code. */
  cpt: z.string().min(1),
  /** Charge for this line, in cents. */
  chargeCents: z.number().int().nonnegative(),
  units: z.number().int().positive().default(1),
  /** Place of service (e.g. "11" office, "53" community MH center). */
  placeOfService: z.string().default("11"),
  /** Modifiers (e.g. telehealth "95"). */
  modifiers: z.array(z.string()).default([]),
});
export type ServiceLine = z.infer<typeof ServiceLine>;

export const Claim = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  payerId: z.string().min(1),
  payerName: z.string().default("PAYER"),
  /** Subscriber/member id (as printed on the card). */
  memberId: z.string().min(1),
  patientLastName: z.string().default("DOE"),
  patientFirstName: z.string().default("JANE"),
  /** Rendering provider NPI. */
  npi: z.string().min(1),
  providerName: z.string().default("PROVIDER"),
  /** Primary diagnosis (ICD-10) codes. */
  diagnoses: z.array(z.string().min(1)).min(1),
  serviceLines: z.array(ServiceLine).min(1),
  /** ISO date (YYYYMMDD or YYYY-MM-DD) of service. */
  serviceDate: z.string().min(1),
  /** Referring provider present? Some payers require it. */
  referringProviderNpi: z.string().optional(),
  /** Prior authorization number, if obtained. */
  priorAuthNumber: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

/**
 * Total charge of a claim in cents. `chargeCents` is the LINE total (X12 SV102),
 * with `units` informational (SV104), so the claim total is the sum of line
 * charges — matching CLM02 = Σ SV102.
 */
export function claimTotalCents(claim: Claim): number {
  return claim.serviceLines.reduce((sum, l) => sum + l.chargeCents, 0);
}

/** One adjustment on a remittance line (a CAS segment in 835). */
export interface ClaimAdjustment {
  /** CAS group: CO (contractual), PR (patient responsibility), OA, PI, CR. */
  group: "CO" | "PR" | "OA" | "PI" | "CR";
  /** CARC reason code (e.g. "197" = auth absent). */
  carc: string;
  amountCents: number;
  /** RARC remark codes (supplemental). */
  rarc?: string[];
}

export interface RemittanceLine {
  claimId: string;
  chargeCents: number;
  paidCents: number;
  adjustments: ClaimAdjustment[];
  /** Claim status code (1 processed as primary, 4 denied, etc.). */
  statusCode: string;
}

export interface Remittance {
  orgId: string;
  payerId: string;
  payerName?: string;
  /** Total payment amount in cents (BPR). */
  paymentCents: number;
  checkOrEftNumber: string;
  lines: RemittanceLine[];
}
