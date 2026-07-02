import { createLogger } from "@cura/core";
import { type HttpClient, type HttpRequest, type HttpResponse, InMemoryJobStore } from "@cura/ehr";
import { buildRegistry } from "./workflows/ehr-sync.js";

/**
 * Worker entrypoint. In a full deployment this attaches to the durable queue
 * (BullMQ/Temporal) and runs `ehrSyncActivity` per job. Here it wires the
 * concrete dependencies and stays running — the workflow logic itself is in
 * `@cura/ehr` and is exercised by tests. No PHI is logged (CONVENTIONS §6).
 */

const logger = createLogger({ name: "worker" });

/** A real fetch-based HTTP client for API-backed EHR adapters. */
export function fetchHttpClient(baseUrl: string): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const url = new URL(req.path, baseUrl);
      for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);
      try {
        const res = await fetch(url, {
          method: req.method,
          headers: { "content-type": "application/json", ...(req.headers ?? {}) },
          ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
        });
        const text = await res.text();
        return { status: res.status, body: text ? safeJson(text) : {} };
      } catch (err) {
        // Network failure → status 0 (adapter maps this to a retryable error).
        logger.warn({ path: req.path, error: String(err) }, "ehr http request failed");
        return { status: 0, body: {} };
      }
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function bootstrap(): void {
  const baseUrl = process.env.EHR_BASE_URL ?? "https://api.simplepractice.com";
  const registry = buildRegistry(fetchHttpClient(baseUrl));
  const jobStore = new InMemoryJobStore();
  logger.info({ vendors: registry.vendors().length }, "worker started");
  // A real deployment would now subscribe to the sync queue and dispatch to
  // ehrSyncActivity(job, { registry, jobStore, audit }). Kept as a stub so the
  // app builds and the workflow lib remains the single source of truth.
  void jobStore;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap();
}
