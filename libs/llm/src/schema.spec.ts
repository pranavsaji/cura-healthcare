import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema, mockValueForSchema } from "./schema.js";

describe("zodToJsonSchema", () => {
  it("converts objects with required vs optional fields", () => {
    const schema = z.object({
      a: z.string(),
      b: z.number().optional(),
      c: z.boolean().default(true),
    });
    const json = zodToJsonSchema(schema) as {
      type: string;
      required: string[];
      properties: Record<string, { type: string }>;
    };
    expect(json.type).toBe("object");
    expect(json.required).toEqual(["a"]); // b optional, c has default
    expect(json.properties.a!.type).toBe("string");
    expect(json.properties.b!.type).toBe("number");
  });

  it("converts arrays, enums, literals, unions, records, nullable", () => {
    expect(zodToJsonSchema(z.array(z.string()))).toMatchObject({ type: "array", items: { type: "string" } });
    expect(zodToJsonSchema(z.enum(["x", "y"]))).toMatchObject({ type: "string", enum: ["x", "y"] });
    expect(zodToJsonSchema(z.literal(5))).toMatchObject({ const: 5 });
    expect(zodToJsonSchema(z.union([z.string(), z.number()]))).toHaveProperty("anyOf");
    expect(zodToJsonSchema(z.record(z.number()))).toMatchObject({ type: "object" });
    expect(zodToJsonSchema(z.string().nullable())).toMatchObject({ type: "string" });
  });
});

describe("mockValueForSchema", () => {
  it("produces a value that passes schema.parse for a nested schema", () => {
    const schema = z.object({
      summary: z.string(),
      count: z.number(),
      tags: z.array(z.enum(["a", "b"])).min(1),
      meta: z.object({ ok: z.boolean() }),
      note: z.string().nullable(),
    });
    const value = mockValueForSchema(schema);
    expect(() => schema.parse(value)).not.toThrow();
  });

  it("respects declared defaults", () => {
    const schema = z.object({ status: z.string().default("draft") });
    expect(mockValueForSchema(schema)).toEqual({ status: "draft" });
  });

  it("emits one array element so .min(1) passes", () => {
    const value = mockValueForSchema(z.array(z.string()).min(1)) as string[];
    expect(value.length).toBe(1);
  });
});
