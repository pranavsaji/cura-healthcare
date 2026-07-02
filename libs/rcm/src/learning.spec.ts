import { describe, expect, it } from "vitest";
import { predictDenial } from "./denials.js";
import { InMemoryLearningStore } from "./learning.js";
import { defaultRuleSet } from "./payer-rules.js";
import { Claim } from "./types.js";

// A "clean" claim: no rule fires, so ONLY the learning loop can move the prediction.
const clean = Claim.parse({
  id: "C1", orgId: "org-1", payerId: "60054", memberId: "M1", npi: "1999999984",
  diagnoses: ["F411"], serviceLines: [{ cpt: "90837", chargeCents: 15000 }],
  serviceDate: "20260615", priorAuthNumber: "A", referringProviderNpi: "1999999984",
});
const rules = defaultRuleSet("60054");

describe("denial-prediction learning loop", () => {
  it("measurably raises the prediction after denial feedback (0 repeat mistakes)", () => {
    const store = new InMemoryLearningStore();
    const before = predictDenial(clean, rules, store.forOrg("org-1")).likelihood;
    expect(before).toBe(0); // no rule signal, no history

    // Feedback: this payer keeps denying 90837 with CARC 197.
    for (let i = 0; i < 4; i++) {
      store.record({ orgId: "org-1", payerId: "60054", cpts: ["90837"], denied: true, carc: "197" });
    }
    store.record({ orgId: "org-1", payerId: "60054", cpts: ["90837"], denied: false });

    const after = predictDenial(clean, rules, store.forOrg("org-1"));
    expect(after.likelihood).toBeGreaterThan(before); // the prediction MOVED
    expect(after.likelihood).toBeCloseTo(0.8, 5); // 4/5 denied
    expect(after.topCarc).toBe("197"); // learned the dominant reason
  });

  it("keeps learning tenant-scoped (org-2 is unaffected by org-1 feedback)", () => {
    const store = new InMemoryLearningStore();
    for (let i = 0; i < 5; i++) {
      store.record({ orgId: "org-1", payerId: "60054", cpts: ["90837"], denied: true, carc: "197" });
    }
    expect(predictDenial(clean, rules, store.forOrg("org-1")).likelihood).toBeGreaterThan(0);
    // org-2 has no history → prediction stays at the (zero) rule baseline.
    expect(predictDenial(clean, rules, store.forOrg("org-2")).likelihood).toBe(0);
  });
});
