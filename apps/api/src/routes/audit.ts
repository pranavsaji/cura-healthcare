import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requirePermission } from "@cura/auth";
import { tenantOf } from "../plugins/context.js";

const canReadAudit = requirePermission("audit:read");

const AuditQuery = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  phiTouched: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/**
 * The Phase 14 audit trail + run-inspector read model. Tenant-scoped: only the
 * caller's org is ever returned, and `audit:read` gates it (biller/admin/owner —
 * a clinician is 403). Serves the live audit ticker (filterable) and the
 * hash-chain integrity status the UI surfaces (verified / broken-at).
 */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/audit", { schema: { querystring: AuditQuery } }, async (req) => {
    const ctx = tenantOf(req);
    canReadAudit(ctx);
    const q = req.query;
    const all = await app.platform.audit.replay(ctx.orgId);
    const filtered = all.filter((e) => {
      if (q.actor && e.actor !== q.actor) return false;
      if (q.action && e.action !== q.action) return false;
      if (q.resource && !e.resource.includes(q.resource)) return false;
      if (q.phiTouched && String(e.phiTouched) !== q.phiTouched) return false;
      return true;
    });
    // Newest first for the ticker; cap to `limit`.
    const events = filtered.slice().reverse().slice(0, q.limit);
    return { events, total: filtered.length };
  });

  r.get("/audit/verify", async (req) => {
    const ctx = tenantOf(req);
    canReadAudit(ctx);
    const chain = await app.platform.audit.verifyChain(ctx.orgId);
    return chain;
  });

  // Run inspector: the ordered steps of a single audited resource (e.g. a note
  // generation), reconstructed from the chain — powers the replay view.
  r.get("/runs/:resource", { schema: { params: z.object({ resource: z.string() }) } }, async (req) => {
    const ctx = tenantOf(req);
    canReadAudit(ctx);
    const all = await app.platform.audit.replay(ctx.orgId);
    const steps = all.filter((e) => e.resource === req.params.resource || e.resource.endsWith(req.params.resource));
    return { resource: req.params.resource, steps };
  });
}
