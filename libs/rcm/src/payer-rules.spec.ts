import { describe, expect, it } from "vitest";
import { Claim } from "./types.js";
import { defaultRuleSet, evaluateClaim } from "./payer-rules.js";

function claim(over: Partial<Claim> = {}): Claim {
  return Claim.parse({
    id: "C1",
    orgId: "org-1",
    payerId: "60054",
    memberId: "M1",
    npi: "1999999984",
    diagnoses: ["F411"],
    serviceLines: [{ cpt: "90837", chargeCents: 15000 }],
    serviceDate: "20260615",
    ...over,
  });
}

describe("payer-rules pre-denial engine", () => {
  const rules = defaultRuleSet("60054");

  it("flags a known pre-denial condition BEFORE submission (missing prior auth → CARC 197)", () => {
    const findings = evaluateClaim(claim(), rules);
    const authFinding = findings.find((f) => f.requirement === "prior_auth");
    expect(authFinding).toBeDefined();
    expect(authFinding!.carc).toBe("197");
    expect(authFinding!.severity).toBe("block");
  });

  it("clears the auth check once a prior-auth number is present", () => {
    const findings = evaluateClaim(claim({ priorAuthNumber: "AUTH-1" }), rules);
    expect(findings.some((f) => f.requirement === "prior_auth")).toBe(false);
  });

  it("flags timely-filing when the claim is past the window", () => {
    const findings = evaluateClaim(claim({ serviceDate: "20260101" }), rules, { today: "20260601" });
    expect(findings.some((f) => f.requirement === "timely_filing" && f.carc === "29")).toBe(true);
  });

  it("does not flag timely-filing within the window", () => {
    const findings = evaluateClaim(claim({ serviceDate: "20260520", priorAuthNumber: "A" }), rules, { today: "20260601" });
    expect(findings.some((f) => f.requirement === "timely_filing")).toBe(false);
  });

  it("flags referring-provider requirement when absent", () => {
    const findings = evaluateClaim(claim(), rules);
    expect(findings.some((f) => f.requirement === "referring_provider" && f.carc === "183")).toBe(true);
  });
});
