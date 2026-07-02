import {
  type AuditSink,
  type EhrSyncOutcome,
  type EhrSyncRequest,
  EhrRegistry,
  type HttpClient,
  type JobStore,
  runEhrSync,
} from "@cura/ehr";

/**
 * The worker's EHR-sync activity. It is a thin wrapper (CONVENTIONS §8): all the
 * durability logic lives in `@cura/ehr`; the worker only supplies the concrete
 * registry (with its HTTP client), the job store, and the audit sink, then hands
 * off to {@link runEhrSync}. Swapping the queue engine (BullMQ → Temporal) means
 * changing only how this function is *invoked*, not the workflow itself.
 */
export interface EhrSyncActivityDeps {
  registry: EhrRegistry;
  jobStore: JobStore;
  audit?: AuditSink;
  onStatus?: (u: { jobId: string; status: string; vendor: string }) => void;
}

export async function ehrSyncActivity(
  req: EhrSyncRequest,
  deps: EhrSyncActivityDeps,
): Promise<EhrSyncOutcome> {
  // Resolve the vendor connector; unknown vendors degrade to assisted-paste.
  const connector = deps.registry.getOrFallback(req.vendor);
  return runEhrSync(req, {
    connector,
    jobStore: deps.jobStore,
    ...(deps.audit ? { audit: deps.audit } : {}),
    ...(deps.onStatus
      ? { onStatus: (u) => deps.onStatus!({ jobId: u.jobId, status: u.status, vendor: u.vendor }) }
      : {}),
  });
}

/** Build a registry from an injected HTTP client (real fetch-based in prod). */
export function buildRegistry(http?: HttpClient): EhrRegistry {
  return new EhrRegistry(http ? { http } : {});
}
