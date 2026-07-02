/**
 * The denial-prediction learning loop. Every claim outcome (accepted / denied +
 * CARC) updates per-tenant, per-(payer, cpt) statistics, so future predictions
 * sharpen — "0 repeat mistakes". All state is `orgId`-scoped and auditable; a
 * Postgres-backed store satisfies the same {@link LearningStats}/{@link LearningStore}
 * interfaces for durable, cross-session learning.
 */

export interface Outcome {
  orgId: string;
  payerId: string;
  cpts: string[];
  denied: boolean;
  /** CARC when denied (for topCarc). */
  carc?: string;
}

/** Read model consumed by `predictDenial`. */
export interface LearningStats {
  /** Learned denial rate (0–1) for a (payer, any of cpts) pair. */
  denialRate(payerId: string, cpts: string[]): number;
  /** Most frequent CARC for a (payer, cpts) pair, if known. */
  topCarc(payerId: string, cpts: string[]): string | undefined;
}

interface Bucket {
  total: number;
  denied: number;
  carcCounts: Map<string, number>;
}

/** In-memory, tenant-scoped learning store. */
export class InMemoryLearningStore implements LearningStats {
  /** orgId → key(payer,cpt) → bucket. */
  private readonly byOrg = new Map<string, Map<string, Bucket>>();
  private scopeOrg = "";

  private key(payerId: string, cpt: string): string {
    return `${payerId}|${cpt}`;
  }

  private buckets(orgId: string): Map<string, Bucket> {
    let m = this.byOrg.get(orgId);
    if (!m) {
      m = new Map();
      this.byOrg.set(orgId, m);
    }
    return m;
  }

  /** Record one outcome — updates every (payer, cpt) bucket it touches. */
  record(outcome: Outcome): void {
    const m = this.buckets(outcome.orgId);
    for (const cpt of outcome.cpts) {
      const k = this.key(outcome.payerId, cpt);
      let b = m.get(k);
      if (!b) {
        b = { total: 0, denied: 0, carcCounts: new Map() };
        m.set(k, b);
      }
      b.total += 1;
      if (outcome.denied) {
        b.denied += 1;
        if (outcome.carc) b.carcCounts.set(outcome.carc, (b.carcCounts.get(outcome.carc) ?? 0) + 1);
      }
    }
  }

  /** Bind the read model to a tenant (so `predictDenial` stays tenant-scoped). */
  forOrg(orgId: string): LearningStats {
    // Arrow fns capture `this` lexically — a view that never reads another tenant.
    return {
      denialRate: (payerId, cpts) => this.rateFor(orgId, payerId, cpts),
      topCarc: (payerId, cpts) => this.topCarcFor(orgId, payerId, cpts),
    };
  }

  // LearningStats on the store itself uses the last-scoped org (convenience).
  denialRate(payerId: string, cpts: string[]): number {
    return this.rateFor(this.scopeOrg, payerId, cpts);
  }
  topCarc(payerId: string, cpts: string[]): string | undefined {
    return this.topCarcFor(this.scopeOrg, payerId, cpts);
  }
  scope(orgId: string): this {
    this.scopeOrg = orgId;
    return this;
  }

  private rateFor(orgId: string, payerId: string, cpts: string[]): number {
    const m = this.byOrg.get(orgId);
    if (!m) return 0;
    let total = 0;
    let denied = 0;
    for (const cpt of cpts) {
      const b = m.get(this.key(payerId, cpt));
      if (b) {
        total += b.total;
        denied += b.denied;
      }
    }
    return total === 0 ? 0 : Math.round((denied / total) * 1000) / 1000;
  }

  private topCarcFor(orgId: string, payerId: string, cpts: string[]): string | undefined {
    const m = this.byOrg.get(orgId);
    if (!m) return undefined;
    const counts = new Map<string, number>();
    for (const cpt of cpts) {
      const b = m.get(this.key(payerId, cpt));
      if (!b) continue;
      for (const [carc, n] of b.carcCounts) counts.set(carc, (counts.get(carc) ?? 0) + n);
    }
    let best: string | undefined;
    let bestN = 0;
    for (const [carc, n] of counts) {
      if (n > bestN) {
        best = carc;
        bestN = n;
      }
    }
    return best;
  }
}
