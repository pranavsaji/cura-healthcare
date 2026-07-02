/**
 * Re-export the shared error taxonomy so services import errors from one place
 * (`@cura/core`) alongside the logger that must render them safely, plus a
 * `toLogSafe` helper that produces a structured, PHI-free view for logging.
 */
export * from "@cura/shared";

import { isAppError } from "@cura/shared";

export interface LogSafeError {
  name: string;
  code?: string;
  httpStatus?: number;
  /** Client-safe message only — never the raw `.message` of an unknown error. */
  message: string;
}

/**
 * Reduce any thrown value to a structured, log-safe shape. For known AppErrors
 * we log the stable code + safe message; unknown errors are logged as a generic
 * internal error so a stray `throw new Error(phi)` can never reach the logs.
 */
export function toLogSafe(err: unknown): LogSafeError {
  if (isAppError(err)) {
    return {
      name: err.name,
      code: err.code,
      httpStatus: err.httpStatus,
      message: err.safeMessage,
    };
  }
  return {
    name: err instanceof Error ? err.name : "UnknownError",
    message: "internal_error",
  };
}
