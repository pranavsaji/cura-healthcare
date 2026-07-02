import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requirePermission } from "@cura/auth";
import { tenantOf } from "../plugins/context.js";
import { ConnectIntegrationBody } from "../schemas.js";

const canRead = requirePermission("notes:read");
const canManageOrg = requirePermission("org:manage");

/**
 * EHR / integration connectors. Full connector logic lands in Phase 13; this
 * exposes the catalog (read) and a guarded `connect` that records the intent as
 * an audited action. `connect` requires `org:manage`, so a clinician is `403`.
 */
export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/integrations", async (req) => {
    const ctx = tenantOf(req);
    canRead(ctx);
    return {
      connectors: [
        { provider: "simplepractice", label: "SimplePractice", status: "available" },
        { provider: "advancedmd", label: "AdvancedMD", status: "available" },
        { provider: "generic-fhir", label: "Generic FHIR", status: "available" },
      ],
    };
  });

  r.post("/integrations/connect", { schema: { body: ConnectIntegrationBody } }, async (req) => {
    const ctx = tenantOf(req);
    canManageOrg(ctx);
    await app.platform.audit.record({
      orgId: ctx.orgId,
      actor: ctx.userId,
      action: "policy.updated",
      resource: `integration:${req.body.provider}`,
      phiTouched: false,
      context: { provider: req.body.provider },
    });
    return { provider: req.body.provider, status: "pending" };
  });
}
