import type { FastifyInstance } from "fastify";
import { requirePermission } from "@cura/auth";
import { tenantOf } from "../plugins/context.js";

const canRead = requirePermission("notes:read");

/** Note templates for the org (read-only here; management lands with Phase 11). */
export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/templates", async (req) => {
    const ctx = tenantOf(req);
    canRead(ctx);
    const store = await app.platform.stores.forTenant(ctx);
    return store.listTemplates();
  });
}
