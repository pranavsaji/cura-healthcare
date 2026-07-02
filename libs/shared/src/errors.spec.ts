import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ProviderError,
  InternalError,
  isAppError,
  toHttp,
} from "./errors.js";

describe("error taxonomy", () => {
  it("each error has a stable code + http status", () => {
    expect(new ValidationError("bad").httpStatus).toBe(400);
    expect(new AuthError().httpStatus).toBe(401);
    expect(new ForbiddenError().httpStatus).toBe(403);
    expect(new NotFoundError("note").httpStatus).toBe(404);
    expect(new ConflictError("dupe").httpStatus).toBe(409);
    expect(new RateLimitError().httpStatus).toBe(429);
    expect(new ProviderError("down").httpStatus).toBe(502);
    expect(new InternalError().httpStatus).toBe(500);
  });

  it("NotFoundError names the resource in a safe message", () => {
    const e = new NotFoundError("note");
    expect(e.safeMessage).toContain("note");
    expect(e.code).toBe("not_found");
  });

  it("isAppError narrows correctly", () => {
    expect(isAppError(new ValidationError("x"))).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("nope")).toBe(false);
  });

  it("AppError is abstract-ish: subclasses set code/status", () => {
    const e = new ValidationError("invalid", { details: { field: "email" } });
    expect(e).toBeInstanceOf(AppError);
    expect(e.details).toEqual({ field: "email" });
  });
});

describe("toHttp", () => {
  it("maps a known AppError to status + safe body", () => {
    const { status, body } = toHttp(new NotFoundError("note"));
    expect(status).toBe(404);
    expect(body.code).toBe("not_found");
    expect(body.message).toContain("note");
  });

  it("includes safe details when present", () => {
    const { body } = toHttp(new ValidationError("invalid", { details: { field: "x" } }));
    expect(body.details).toEqual({ field: "x" });
  });

  it("hides internals for unknown errors (no PHI/stack leak)", () => {
    const secret = new Error("patient SSN 123-45-6789 in db row 42");
    const { status, body } = toHttp(secret);
    expect(status).toBe(500);
    expect(body.code).toBe("internal_error");
    expect(body.message).not.toContain("SSN");
    expect(JSON.stringify(body)).not.toContain("123-45-6789");
  });
});
