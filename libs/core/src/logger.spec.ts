import { describe, it, expect } from "vitest";
import { NotFoundError } from "@cura/shared";
import { createLogger, childLogger } from "./logger.js";
import { toLogSafe } from "./errors.js";

function capture() {
  const lines: string[] = [];
  return {
    stream: {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
    parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("logger PHI/secret redaction", () => {
  it("redacts PHI-shaped fields at top level and one level deep", () => {
    const sink = capture();
    const logger = createLogger({ level: "info", destination: sink.stream });
    logger.info(
      { orgId: "org_1", clientLabel: "S. Mitchell · 32F", client: { mrn: "12345" } },
      "session created",
    );
    const entry = sink.parsed()[0]!;
    expect(entry.orgId).toBe("org_1");
    expect(entry.clientLabel).toBe("[redacted]");
    expect((entry.client as Record<string, unknown>).mrn).toBe("[redacted]");
    expect(JSON.stringify(entry)).not.toContain("Mitchell");
  });

  it("redacts secrets and auth headers", () => {
    const sink = capture();
    const logger = createLogger({ destination: sink.stream });
    logger.info({ token: "sk-abc", req: { headers: { authorization: "Bearer xyz" } } }, "req");
    const entry = sink.parsed()[0]!;
    expect(entry.token).toBe("[redacted]");
    expect(JSON.stringify(entry)).not.toContain("Bearer xyz");
  });

  it("child loggers carry correlation context", () => {
    const sink = capture();
    const base = createLogger({ destination: sink.stream });
    const child = childLogger(base, { orgId: "org_2", requestId: "req_9" });
    child.info("handled");
    const entry = sink.parsed()[0]!;
    expect(entry.orgId).toBe("org_2");
    expect(entry.requestId).toBe("req_9");
  });
});

describe("toLogSafe", () => {
  it("keeps AppError code + safe message", () => {
    expect(toLogSafe(new NotFoundError("note"))).toMatchObject({
      code: "not_found",
      httpStatus: 404,
      message: "The requested note was not found",
    });
  });

  it("collapses unknown errors to a generic internal error", () => {
    const safe = toLogSafe(new Error("secret PHI in message"));
    expect(safe.message).toBe("internal_error");
    expect(JSON.stringify(safe)).not.toContain("PHI");
  });
});
