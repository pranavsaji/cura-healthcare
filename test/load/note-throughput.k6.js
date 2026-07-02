import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

/**
 * k6 load script — note-generation throughput against a REAL deployed API
 * (staging). Run: `k6 run -e BASE_URL=https://staging.api -e TOKEN=... test/load/note-throughput.k6.js`.
 * The in-process `nfr.spec.ts` gates every CI run; this drives a real environment
 * with concurrency to validate the NFRs end-to-end (network, PG, Redis).
 */
const BASE = __ENV.BASE_URL || "http://localhost:4711";
const TOKEN = __ENV.TOKEN || "";

const noteLatency = new Trend("note_draft_ms", true);
const partialLatency = new Trend("partial_ms", true);

export const options = {
  scenarios: {
    steady: { executor: "constant-vus", vus: Number(__ENV.VUS || 20), duration: __ENV.DURATION || "1m" },
  },
  thresholds: {
    // NFRs: partials < 1.5s, note draft < 60s (p95).
    partial_ms: ["p(95)<1500"],
    note_draft_ms: ["p(95)<60000"],
    http_req_failed: ["rate<0.01"],
  },
};

const headers = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };

export default function () {
  const created = http.post(`${BASE}/sessions`, JSON.stringify({ clientLabel: "Load" }), { headers });
  check(created, { "session created": (r) => r.status === 201 });
  const id = created.json("id");

  http.post(`${BASE}/sessions/${id}/consent`, null, { headers });

  const p0 = Date.now();
  http.post(`${BASE}/sessions/${id}/audio`, JSON.stringify({ audio: "AAAA" }), { headers });
  partialLatency.add(Date.now() - p0);

  const n0 = Date.now();
  const gen = http.post(`${BASE}/sessions/${id}/generate`, null, { headers });
  noteLatency.add(Date.now() - n0);
  check(gen, { "note generated": (r) => r.status === 201 });

  sleep(1);
}
