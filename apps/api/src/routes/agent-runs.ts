import type { FastifyInstance } from "fastify";
import { requirePermission } from "@cura/auth";
import { tenantOf } from "../plugins/context.js";

const canReadAudit = requirePermission("audit:read");

/**
 * Read model over the org's audited actions — the data source the Phase 14
 * observability/audit UI consumes. Requires `audit:read` (biller/admin/owner),
 * so a clinician is `403`. Tenant-scoped: only the caller's org is ever returned.
 */
export async function agentRunRoutes(app: FastifyInstance): Promise<void> {
  app.get("/agent-runs", async (req) => {
    const ctx = tenantOf(req);
    canReadAudit(ctx);
    const events = await app.platform.audit.replay(ctx.orgId);
    return { events };
  });
}
