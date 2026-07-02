import { z } from "zod";

/**
 * Request schemas for the gateway. Reused as both the zod validator (reject at
 * the boundary → `ValidationError`) and the OpenAPI source of truth, so docs and
 * validation stay in lockstep (CONVENTIONS §3). Domain schemas come from
 * `@cura/shared`; these cover HTTP-shaped params/bodies.
 */

export const IdParams = z.object({ id: z.string().min(1) });
export type IdParams = z.infer<typeof IdParams>;

export const SectionPatchBody = z.object({
  sectionKey: z.string().min(1),
  content: z.string(),
});
export type SectionPatchBody = z.infer<typeof SectionPatchBody>;

export const ConnectIntegrationBody = z.object({
  provider: z.string().min(1),
  config: z.record(z.string()).default({}),
});
export type ConnectIntegrationBody = z.infer<typeof ConnectIntegrationBody>;

export const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;
