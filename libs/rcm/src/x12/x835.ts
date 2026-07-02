import type { ClaimAdjustment, Remittance } from "../types.js";
import { amountToCents, assemble, centsToAmount, parseSegments, seg } from "./segments.js";

/**
 * 835 (ERA / remittance advice) codec. `build835` synthesizes an ERA (so tests
 * can generate → parse a payer response), `parse835` turns an ERA into a
 * {@link Remittance} with per-claim payments + CAS adjustments (CARC codes) — the
 * input to payment posting + denial detection.
 */
export function build835(rem: Remittance, opts: { controlNumber?: string; date?: string } = {}): string {
  const ctrl = (opts.controlNumber ?? "000000001").padStart(9, "0");
  const date = opts.date ?? "20260702";

  const body: string[] = [];
  body.push(seg("ST", "835", "0001"));
  body.push(seg("BPR", "I", centsToAmount(rem.paymentCents), "C", "ACH", "CCP", "", "", "", "", "", "", "", "", date));
  body.push(seg("TRN", "1", rem.checkOrEftNumber, "1234567890"));
  body.push(seg("N1", "PR", rem.payerName ?? "PAYER"));
  body.push(seg("N1", "PE", "CURA HEALTH", "XX", "1999999984"));

  for (const line of rem.lines) {
    // CLP: claim payment info.
    body.push(
      seg("CLP", line.claimId, line.statusCode, centsToAmount(line.chargeCents), centsToAmount(line.paidCents), "", "CI", line.claimId),
    );
    // CAS: adjustments grouped by group code.
    for (const adj of line.adjustments) {
      const rarc = adj.rarc ?? [];
      body.push(seg("CAS", adj.group, adj.carc, centsToAmount(adj.amountCents), "", ...rarc));
    }
  }

  const seCount = body.length + 1;
  body.push(seg("SE", String(seCount), "0001"));

  const isa = seg(
    "ISA", "00", "".padEnd(10), "00", "".padEnd(10),
    "ZZ", (rem.payerId ?? "PAYER").padEnd(15).slice(0, 15), "ZZ", "CURA".padEnd(15),
    date.slice(2), "1200", "^", "00501", ctrl, "0", "P", ":",
  );
  const gs = seg("GS", "HP", rem.payerId ?? "PAYER", "CURA", date, "1200", ctrl.replace(/^0+/, "") || "1", "X", "005010X221A1");
  const ge = seg("GE", "1", ctrl.replace(/^0+/, "") || "1");
  const iea = seg("IEA", "1", ctrl);
  return assemble([isa, gs, ...body, ge, iea]);
}

export function parse835(edi: string, orgId: string): Remittance {
  const segments = parseSegments(edi);
  const bpr = segments.find((s) => s.tag === "BPR");
  const trn = segments.find((s) => s.tag === "TRN");
  const payer = segments.find((s) => s.tag === "N1" && s.elements[0] === "PR");
  const isa = segments.find((s) => s.tag === "ISA");

  const lines: Remittance["lines"] = [];
  let current: Remittance["lines"][number] | undefined;
  for (const s of segments) {
    if (s.tag === "CLP") {
      current = {
        claimId: s.elements[0] ?? "",
        statusCode: s.elements[1] ?? "",
        chargeCents: amountToCents(s.elements[2] ?? "0"),
        paidCents: amountToCents(s.elements[3] ?? "0"),
        adjustments: [],
      };
      lines.push(current);
    } else if (s.tag === "CAS" && current) {
      const group = (s.elements[0] ?? "CO") as ClaimAdjustment["group"];
      const adj: ClaimAdjustment = {
        group,
        carc: s.elements[1] ?? "",
        amountCents: amountToCents(s.elements[2] ?? "0"),
      };
      // Remaining elements after (code, amount, quantity) may carry more triplets/RARC.
      const rarc = s.elements.slice(4).filter((e) => e && !/^\d+\.\d\d$/.test(e));
      if (rarc.length) adj.rarc = rarc;
      current.adjustments.push(adj);
    }
  }

  return {
    orgId,
    payerId: isa?.elements[5]?.trim() ?? payer?.elements[1] ?? "",
    payerName: payer?.elements[1],
    paymentCents: bpr ? amountToCents(bpr.elements[1] ?? "0") : 0,
    checkOrEftNumber: trn?.elements[1] ?? "",
    lines,
  } as Remittance;
}
