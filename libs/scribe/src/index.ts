import { systemClock, uuidIdGen, type Clock, type IdGen } from "@cura/core";
import type { AuditLog } from "@cura/audit";
import type { AsrProvider } from "@cura/transcription";
import { SessionService } from "./session-service.js";
import { TranscriptService } from "./transcript-service.js";
import { CaptureService } from "./capture-service.js";
import type { ObjectStore } from "./storage/index.js";

export * from "./storage/index.js";
export * from "./session-service.js";
export * from "./transcript-service.js";
export * from "./capture-service.js";

/** The scribe domain services, sharing one dependency bundle. */
export interface ScribeServices {
  sessions: SessionService;
  transcripts: TranscriptService;
  capture: CaptureService;
}

export interface CreateScribeOptions {
  asr: AsrProvider;
  objectStore: ObjectStore;
  audit: AuditLog;
  clock?: Clock;
  ids?: IdGen;
  retentionDays?: number;
}

/**
 * Wire the scribe services together. Reused by the API routes, the realtime hub,
 * and the worker — business capability lives here, apps stay thin (CONVENTIONS
 * §8). All external capabilities (ASR, storage) are injected behind interfaces.
 */
export function createScribeServices(opts: CreateScribeOptions): ScribeServices {
  const clock = opts.clock ?? systemClock;
  const ids = opts.ids ?? uuidIdGen;
  const sessions = new SessionService({ audit: opts.audit, clock });
  const transcripts = new TranscriptService({
    asr: opts.asr,
    objectStore: opts.objectStore,
    sessions,
    audit: opts.audit,
    clock,
    ids,
    ...(opts.retentionDays !== undefined ? { retentionDays: opts.retentionDays } : {}),
  });
  const capture = new CaptureService({ asr: opts.asr, sessions, transcripts });
  return { sessions, transcripts, capture };
}
