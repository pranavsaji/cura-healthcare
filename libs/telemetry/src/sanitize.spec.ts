import { describe, expect, it } from "vitest";
import { isPhiKey, sanitizeAttributes } from "./sanitize.js";

describe("PHI-free attribute sanitizer", () => {
  it("recognizes PHI/secret field names (incl. substrings)", () => {
    for (const k of ["content", "transcript", "clientLabel", "patient_name", "note_content", "accessToken", "authorization"]) {
      expect(isPhiKey(k)).toBe(true);
    }
    for (const k of ["http.route", "status_code", "duration_ms", "org.id", "request.id"]) {
      expect(isPhiKey(k)).toBe(false);
    }
  });

  it("drops PHI keys and keeps safe primitives", () => {
    const { attributes, dropped } = sanitizeAttributes({
      "http.route": "/notes/:id",
      "http.status_code": 200,
      transcript: "client said ...",
      clientLabel: "Client A",
    });
    expect(attributes).toEqual({ "http.route": "/notes/:id", "http.status_code": 200 });
    expect(dropped.sort()).toEqual(["clientLabel", "transcript"]);
  });

  it("drops non-primitive values (objects/arrays could smuggle PHI)", () => {
    const { attributes, dropped } = sanitizeAttributes({
      ok: 1,
      // @ts-expect-error intentionally passing a disallowed value type
      payload: { note: "secret" },
      // @ts-expect-error intentionally passing a disallowed value type
      list: [1, 2, 3],
    });
    expect(attributes).toEqual({ ok: 1 });
    expect(dropped.sort()).toEqual(["list", "payload"]);
  });
});
