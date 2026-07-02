/**
 * The error taxonomy. Every expected failure in the system is one of these.
 * Each carries a stable machine `code` and an HTTP status. `safeMessage` is the
 * ONLY text allowed to reach a client — it must never contain PHI or internals.
 * The API error handler (Phase 06) uses `toHttp()` to render responses.
 */

export type AppErrorCode =
  | "validation_error"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "provider_error"
  | "rate_limited"
  | "internal_error";

export interface AppErrorOptions {
  /** Non-sensitive structured detail safe to return to the client. */
  details?: unknown;
  /** The underlying error, kept for internal logging only (never serialized out). */
  cause?: unknown;
}

export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode;
  abstract readonly httpStatus: number;
  /** Client-safe message (no PHI, no internals). */
  readonly safeMessage: string;
  readonly details?: unknown;

  constructor(safeMessage: string, options: AppErrorOptions = {}) {
    super(safeMessage, { cause: options.cause });
    this.name = new.target.name;
    this.safeMessage = safeMessage;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  readonly code = "validation_error" as const;
  readonly httpStatus = 400;
}

export class AuthError extends AppError {
  readonly code = "unauthorized" as const;
  readonly httpStatus = 401;
  constructor(safeMessage = "Authentication required", options?: AppErrorOptions) {
    super(safeMessage, options);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "forbidden" as const;
  readonly httpStatus = 403;
  constructor(safeMessage = "You do not have access to this resource", options?: AppErrorOptions) {
    super(safeMessage, options);
  }
}

export class NotFoundError extends AppError {
  readonly code = "not_found" as const;
  readonly httpStatus = 404;
  constructor(resource = "resource", options?: AppErrorOptions) {
    super(`The requested ${resource} was not found`, options);
  }
}

export class ConflictError extends AppError {
  readonly code = "conflict" as const;
  readonly httpStatus = 409;
}

export class RateLimitError extends AppError {
  readonly code = "rate_limited" as const;
  readonly httpStatus = 429;
  constructor(safeMessage = "Too many requests", options?: AppErrorOptions) {
    super(safeMessage, options);
  }
}

export class ProviderError extends AppError {
  readonly code = "provider_error" as const;
  readonly httpStatus = 502;
}

export class InternalError extends AppError {
  readonly code = "internal_error" as const;
  readonly httpStatus = 500;
  constructor(safeMessage = "An unexpected error occurred", options?: AppErrorOptions) {
    super(safeMessage, options);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export interface HttpErrorBody {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Map any thrown value to a safe HTTP response. Unknown/unexpected errors become
 * a generic 500 — their message is NOT leaked (could contain PHI/internals).
 */
export function toHttp(err: unknown): { status: number; body: HttpErrorBody } {
  if (isAppError(err)) {
    return {
      status: err.httpStatus,
      body: {
        code: err.code,
        message: err.safeMessage,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
  }
  return {
    status: 500,
    body: { code: "internal_error", message: "An unexpected error occurred" },
  };
}
