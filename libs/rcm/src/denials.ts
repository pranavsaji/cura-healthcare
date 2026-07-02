import { evaluateClaim, type PayerRuleSet } from "./payer-rules.js";
import type { LearningStats } from "./learning.js";
import type { Claim, Remittance } from "./types.js";

/**
 * Denial intelligence: CARC/RARC decoding, detecting denials on an 835, and
 * **predicting** a denial before submission by combining the deterministic
 * payer-rules signal with the per-tenant learned denial rate (noisy-OR). The
 * learning loop (`learning.ts`) feeds `LearningStats`, so predictions sharpen as
 * outcomes accrue.
 */

export interface CarcInfo {
  code: string;
  reason: string;
  category: "authorization" | "eligibility" | "coding" | "timely" | "coverage" | "other";
  /** The next best action to resolve it. */
  action: string;
}

/** Common CARC (Claim Adjustment Reason Codes) seen in behavioral health. */
export const CARC_LIBRARY: Record<string, CarcInfo> = {
  "16": { code: "16", reason: "Claim lacks information or has a submission error", category: "coding", action: "Correct and resubmit with the missing data." },
  "18": { code: "18", reason: "Duplicate claim/service", category: "other", action: "Do not resubmit; verify the original disposition." },
  "27": { code: "27", reason: "Expenses incurred after coverage terminated", category: "eligibility", action: "Verify eligibility dates; bill the patient or correct DOS." },
  "29": { code: "29", reason: "Time limit for filing has expired", category: "timely", action: "Appeal with proof of timely filing if available." },
  "50": { code: "50", reason: "Non-covered; not deemed a medical necessity", category: "coverage", action: "Submit medical-necessity documentation on appeal." },
  "96": { code: "96", reason: "Non-covered charge(s)", category: "coverage", action: "Check plan benefits; bill patient if appropriate." },
  "197": { code: "197", reason: "Precertification/authorization absent", category: "authorization", action: "Obtain retro-authorization and appeal." },
  "commonpr": { code: "1", reason: "Deductible amount", category: "other", action: "Bill the patient the deductible." },
};

/** RARC remark codes (supplemental). */
export const RARC_LIBRARY: Record<string, string> = {
  N130: "Consult plan benefit documents for information about restrictions.",
  N30: "Patient ineligible for this service.",
  M76: "Missing/incomplete/invalid diagnosis or condition.",
};

export function describeCarc(code: string): CarcInfo {
  return CARC_LIBRARY[code] ?? { code, reason: `Unmapped CARC ${code}`, category: "other", action: "Manual review." };
}

export interface Denial {
  claimId: string;
  carc: string;
  reason: string;
  category: CarcInfo["category"];
  amountCents: number;
  suggestedAction: string;
  /** True for patient-responsibility (PR) adjustments — not a true "denial". */
  patientResponsibility: boolean;
}

/** Detect denials on a parsed 835. Ignores pure contractual write-offs on paid lines. */
export function detectDenials(rem: Remittance): Denial[] {
  const denials: Denial[] = [];
  for (const line of rem.lines) {
    const denied = line.statusCode === "4" || line.paidCents === 0;
    for (const adj of line.adjustments) {
      // Contractual (CO) write-off on an otherwise-paid claim is not a denial.
      if (adj.group === "CO" && !denied) continue;
      const info = describeCarc(adj.carc);
      denials.push({
        claimId: line.claimId,
        carc: adj.carc,
        reason: info.reason,
        category: info.category,
        amountCents: adj.amountCents,
        suggestedAction: info.action,
        patientResponsibility: adj.group === "PR",
      });
    }
  }
  return denials;
}

export interface DenialPrediction {
  /** Probability (0–1) this claim is denied if submitted as-is. */
  likelihood: number;
  /** The most likely CARC, if any signal exists. */
  topCarc?: string;
  reasons: string[];
}

/**
 * Predict a denial BEFORE submission. Combines the deterministic rules signal
 * with the learned per-(payer,cpt) denial rate via noisy-OR, so either can raise
 * the likelihood and feedback measurably moves it.
 */
export function predictDenial(claim: Claim, ruleSet: PayerRuleSet, learned?: LearningStats): DenialPrediction {
  const findings = evaluateClaim(claim, ruleSet, { today: undefined });
  const blocking = findings.filter((f) => f.severity === "block");
  const ruleSignal = blocking.length ? 0.85 : findings.length ? 0.4 : 0;

  const cpts = claim.serviceLines.map((l) => l.cpt);
  const learnedRate = learned ? learned.denialRate(claim.payerId, cpts) : 0;

  // Noisy-OR: independent contributions combine so feedback always moves the needle.
  const likelihood = round(1 - (1 - ruleSignal) * (1 - learnedRate));

  const reasons = [
    ...blocking.map((f) => `${f.message} (CARC ${f.carc})`),
    ...(learnedRate > 0 ? [`Historical denial rate ${(learnedRate * 100).toFixed(0)}% for this payer/procedure`] : []),
  ];
  const topCarc = blocking[0]?.carc ?? learned?.topCarc(claim.payerId, cpts);

  return { likelihood, ...(topCarc ? { topCarc } : {}), reasons };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
