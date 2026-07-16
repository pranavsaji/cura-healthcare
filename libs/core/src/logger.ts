import pino, { type Logger as PinoLogger, type DestinationStream } from "pino";

/**
 * Structured logging with PHI/secret redaction baked in (CONVENTIONS §6). We log
 * `orgId`, ids, durations, and outcomes — never note/transcript content, client
 * identifiers, tokens, or auth headers. Redaction is on by default so a careless
 * `logger.info({ note })` cannot leak content.
 */

export type Logger = PinoLogger;

/** Correlation context carried by child loggers on every request/job. */
export interface LogContext {
  orgId?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  [key: string]: unknown;
}

/**
 * Dotted paths pino redacts. Covers PHI fields (note/transcript/audio/client
 * identifiers) and credentials, at the top level and one nesting level deep so
 * `{ req: { headers: { authorization } } }` and `{ client: { mrn } }` are caught.
 */
const PHI_AND_SECRET_FIELDS = [
  "mrn",
  "displayLabel",
  "clientLabel",
  "content",
  "text",
  "transcript",
  "segments",
  "audio",
  "quote",
  "password",
  "token",
  "apiKey",
  "authorization",
  "cookie",
  "ENCRYPTION_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "ASR_API_KEY",
  "DEEPGRAM_API_KEY",
  "ASSEMBLYAI_API_KEY",
  "WORKOS_API_KEY",
];

const REDACT_PATHS = PHI_AND_SECRET_FIELDS.flatMap((f) => [f, `*.${f}`, `req.headers.${f}`]);

export interface LoggerOptions {
  level?: string;
  name?: string;
  /** Injectable sink for tests (capture emitted JSON lines). */
  destination?: DestinationStream;
}

/** Create the base logger. Prefer one per process; derive children per request. */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const options: pino.LoggerOptions = {
    level: opts.level ?? process.env.LOG_LEVEL ?? "info",
    name: opts.name,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    base: undefined, // drop pid/hostname noise; correlation ids come from children
  };
  return opts.destination ? pino(options, opts.destination) : pino(options);
}

/** Derive a request/job-scoped child logger carrying correlation ids. */
export function childLogger(logger: Logger, ctx: LogContext): Logger {
  return logger.child(ctx);
}
