import { type Claim, claimTotalCents } from "./types.js";

/**
 * The payer-rules engine. Per-payer requirements are encoded as rules; running
 * them against a claim BEFORE submission surfaces the issues that would bounce it
 * ("catch issues before they become denials"). Each finding maps to the CARC the
 * payer would return, so pre-denial checks and denial handling speak the same
 * language. Rules are data (per-tenant, learnable — see `learning.ts`), not code.
 */

export interface PayerRule {
  /** Which CPT codes this rule applies to (empty = all). */
  cpts?: string[];
  /** The requirement being enforced. */
  requirement:
    | "prior_auth"
    | "referring_provider"
    | "timely_filing"
    | "valid_pos"
    | "diagnosis_required";
  /** Extra config (e.g. timely-filing days, allowed POS codes). */
  config?: Record<string, unknown>;
  /** The CARC the payer returns when this requirement is unmet. */
  carc: string;
  message: string;
}

export interface PayerRuleSet {
  payerId: string;
  rules: PayerRule[];
}

export interface PreDenialFinding {
  requirement: PayerRule["requirement"];
  carc: string;
  message: string;
  /** How confident we are this WOULD be denied (0–1). Rules are deterministic → 1. */
  severity: "block" | "warn";
}

/** Default rules for common behavioral-health payer requirements. */
export function defaultRuleSet(payerId: string): PayerRuleSet {
  return {
    payerId,
    rules: [
      {
        cpts: ["90837", "90847", "H0015"],
        requirement: "prior_auth",
        carc: "197", // "Precertification/authorization absent"
        message: "Prior authorization required for this service",
      },
      { requirement: "referring_provider", carc: "183", message: "Referring provider required" },
      {
        requirement: "timely_filing",
        config: { days: 90 },
        carc: "29", // "Time limit for filing has expired"
        message: "Claim exceeds the payer's timely-filing window",
      },
      { requirement: "diagnosis_required", carc: "16", message: "Claim lacks required diagnosis" },
    ],
  };
}

export interface EvaluateOptions {
  /** Today (YYYYMMDD) for timely-filing math — injected for determinism. */
  today?: string;
}

/** Run a payer's rules against a claim and return the pre-denial findings. */
export function evaluateClaim(
  claim: Claim,
  ruleSet: PayerRuleSet,
  opts: EvaluateOptions = {},
): PreDenialFinding[] {
  const findings: PreDenialFinding[] = [];
  const cpts = new Set(claim.serviceLines.map((l) => l.cpt));

  for (const rule of ruleSet.rules) {
    const applies = !rule.cpts || rule.cpts.some((c) => cpts.has(c));
    if (!applies) continue;

    switch (rule.requirement) {
      case "prior_auth":
        if (!claim.priorAuthNumber) findings.push(finding(rule, "block"));
        break;
      case "referring_provider":
        if (!claim.referringProviderNpi) findings.push(finding(rule, "block"));
        break;
      case "diagnosis_required":
        if (claim.diagnoses.length === 0) findings.push(finding(rule, "block"));
        break;
      case "timely_filing": {
        const days = Number(rule.config?.days ?? 365);
        if (opts.today && daysBetween(digits(claim.serviceDate), opts.today) > days) {
          findings.push(finding(rule, "block"));
        }
        break;
      }
      case "valid_pos": {
        const allowed = (rule.config?.allowed as string[] | undefined) ?? [];
        if (allowed.length && claim.serviceLines.some((l) => !allowed.includes(l.placeOfService))) {
          findings.push(finding(rule, "warn"));
        }
        break;
      }
    }
  }
  // A zero-dollar claim is always a problem.
  if (claimTotalCents(claim) === 0) {
    findings.push({ requirement: "diagnosis_required", carc: "16", message: "Claim total is $0", severity: "block" });
  }
  return findings;
}

function finding(rule: PayerRule, severity: PreDenialFinding["severity"]): PreDenialFinding {
  return { requirement: rule.requirement, carc: rule.carc, message: rule.message, severity };
}

function digits(s: string): string {
  return s.replace(/\D/g, "").slice(0, 8);
}

function daysBetween(yyyymmddA: string, yyyymmddB: string): number {
  const toDate = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  return Math.round((toDate(yyyymmddB) - toDate(yyyymmddA)) / 86_400_000);
}
