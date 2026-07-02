import fp from "fastify-plugin";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  type AppErrorCode,
  AppError,
  NotFoundError,
  ValidationError,
  isAppError,
  toHttp,
} from "@cura/shared";
import { toLogSafe } from "@cura/core";

/**
 * The single error boundary (CONVENTIONS §3). Maps the {@link AppError} taxonomy
 * and zod/validation failures to safe HTTP bodies via `toHttp`, and collapses
 * any unexpected error to a generic `500` — never leaking a stack, message, or
 * PHI to the client. The full error is logged internally in a PHI-safe shape.
 */
export const errorHandlerPlugin = fp(
  async function errorHandler(app) {
    app.setErrorHandler((err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
      const mapped = normalize(err);

      // Fastify's own client errors (malformed JSON 400, unsupported media 415,
      // payload too large 413, etc.) carry a valid 4xx `statusCode`. Respect it —
      // collapsing a 4xx to a generic 500 both misleads the client and pollutes
      // error-rate monitoring/alerting. We still send only a safe, canned message.
      const client = !isAppError(mapped) ? clientErrorFrom(err) : null;
      if (client) {
        req.log.warn({ err: toLogSafe(err), requestId: req.id }, "request.rejected");
        void reply.code(client.status).send({ code: client.code, message: client.message });
        return;
      }

      // Log the full error internally (log-safe: unknown errors never echo content).
      if (isAppError(mapped) && mapped.httpStatus < 500) {
        req.log.warn({ err: toLogSafe(mapped), requestId: req.id }, "request.rejected");
      } else {
        req.log.error({ err: toLogSafe(mapped), requestId: req.id }, "request.failed");
      }

      const { status, body } = toHttp(mapped);
      void reply.code(status).send(body);
    });

    // Unknown routes → typed 404 (consistent body shape, no HTML).
    app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
      const { status, body } = toHttp(new NotFoundError("route"));
      void reply.code(status).send(body);
    });
  },
  { name: "error-handler" },
);

/** Reduce any thrown value to an {@link AppError} (or leave unknown for a 500). */
function normalize(err: unknown): unknown {
  if (isAppError(err)) return err;

  const issues = extractValidationIssues(err);
  if (issues) {
    return new ValidationError("Request validation failed", { details: issues });
  }
  return err; // toHttp maps unknown → generic 500
}

/**
 * Map a Fastify (or any) error carrying a 4xx `statusCode` to a safe, typed
 * client-error body. Returns null for 5xx / status-less errors, which fall
 * through to the generic 500 path. Messages are canned (never echo `err.message`
 * — it could carry internals/PHI).
 */
function clientErrorFrom(err: unknown): { status: number; code: AppErrorCode; message: string } | null {
  const status = (err as { statusCode?: unknown })?.statusCode;
  if (typeof status !== "number" || status < 400 || status >= 500) return null;
  const code: AppErrorCode =
    status === 401
      ? "unauthorized"
      : status === 403
        ? "forbidden"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 429
              ? "rate_limited"
              : "validation_error";
  const messages: Record<AppErrorCode, string> = {
    validation_error: "The request could not be processed",
    unauthorized: "Authentication required",
    forbidden: "You do not have access to this resource",
    not_found: "The requested resource was not found",
    conflict: "The request conflicts with the current state",
    rate_limited: "Too many requests",
    provider_error: "Upstream provider error",
    internal_error: "An unexpected error occurred",
  };
  return { status, code, message: messages[code] };
}

interface Issue {
  path: string;
  message: string;
}

/** Pull safe field/message pairs out of a zod or Fastify validation error. */
function extractValidationIssues(err: unknown): Issue[] | null {
  if (err instanceof ZodError) {
    return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  }
  const anyErr = err as {
    validation?: Array<{ instancePath?: string; message?: string }>;
    code?: string;
    cause?: unknown;
  };
  // fastify-type-provider-zod wraps ZodError on the `cause`.
  if (anyErr?.cause instanceof ZodError) {
    return anyErr.cause.issues.map((i) => ({ path: i.path.join("."), message: i.message ?? "" }));
  }
  if (Array.isArray(anyErr?.validation)) {
    return anyErr.validation.map((v) => ({
      path: (v.instancePath ?? "").replace(/^\//, "").replace(/\//g, "."),
      message: v.message ?? "invalid",
    }));
  }
  return null;
}

export { AppError };
