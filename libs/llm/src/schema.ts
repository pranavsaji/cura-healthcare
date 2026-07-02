import { z } from "zod";

/**
 * Minimal zod ⇆ JSON-Schema bridge, plus a deterministic mock-value generator.
 *
 * We deliberately hand-roll a small converter (covering exactly the zod features
 * the note/agent schemas use) rather than add a dependency: it keeps `@cura/llm`
 * dependency-light and gives us total control over the JSON Schema shape sent to
 * Anthropic's tool `input_schema`. `mockValueForSchema` walks the same schema to
 * synthesize a minimal VALID value, so the mock provider's structured output
 * always passes `schema.parse()` — the core contract guarantee.
 */

type JsonSchema = Record<string, unknown>;

// zod's internal type tags (stable across zod 3.x).
type Def = { typeName: string; [k: string]: unknown };
function def(schema: z.ZodTypeAny): Def {
  return (schema as unknown as { _def: Def })._def;
}

/** Convert a zod schema to a JSON Schema object for tool `input_schema`. */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const d = def(schema);
  switch (d.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNull":
      return { type: "null" };
    case "ZodLiteral":
      return { const: d.value };
    case "ZodEnum":
      return { type: "string", enum: d.values as string[] };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(d.type as z.ZodTypeAny) };
    case "ZodObject": {
      const shape = (d.shape as () => Record<string, z.ZodTypeAny>)();
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isOptional(value)) required.push(key);
      }
      return { type: "object", properties, required, additionalProperties: false };
    }
    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault":
      return zodToJsonSchema(unwrap(schema));
    case "ZodEffects":
      return zodToJsonSchema((d.schema as z.ZodTypeAny) ?? z.unknown());
    case "ZodUnion": {
      const options = (d.options as z.ZodTypeAny[]).map(zodToJsonSchema);
      return { anyOf: options };
    }
    case "ZodRecord":
      return { type: "object", additionalProperties: zodToJsonSchema(d.valueType as z.ZodTypeAny) };
    default:
      return {}; // permissive fallback (any)
  }
}

/**
 * Produce a minimal VALID value for a schema. Strings → a readable placeholder,
 * numbers → 0, enums → first member, arrays → one element, objects → recurse.
 * Deterministic (no Date/random) so mock output and tests are reproducible.
 */
export function mockValueForSchema(schema: z.ZodTypeAny, keyHint = "value"): unknown {
  const d = def(schema);
  switch (d.typeName) {
    case "ZodString":
      return `mock ${keyHint}`;
    case "ZodNumber":
      return 0;
    case "ZodBoolean":
      return false;
    case "ZodNull":
      return null;
    case "ZodLiteral":
      return d.value;
    case "ZodEnum":
      return (d.values as string[])[0];
    case "ZodArray": {
      // One element so `.min(1)` schemas pass; element is itself minimal-valid.
      return [mockValueForSchema(d.type as z.ZodTypeAny, singular(keyHint))];
    }
    case "ZodObject": {
      const shape = (d.shape as () => Record<string, z.ZodTypeAny>)();
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        out[key] = mockValueForSchema(value, key);
      }
      return out;
    }
    case "ZodOptional":
    case "ZodNullable":
      return mockValueForSchema(unwrap(schema), keyHint);
    case "ZodDefault":
      // Respect the declared default when present.
      return (d.defaultValue as () => unknown)();
    case "ZodEffects":
      return mockValueForSchema((d.schema as z.ZodTypeAny) ?? z.any(), keyHint);
    case "ZodUnion":
      return mockValueForSchema((d.options as z.ZodTypeAny[])[0]!, keyHint);
    case "ZodRecord":
      return {};
    default:
      return null;
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const t = def(schema).typeName;
  return t === "ZodOptional" || t === "ZodDefault";
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  const d = def(schema);
  if (d.typeName === "ZodOptional" || d.typeName === "ZodNullable") return d.innerType as z.ZodTypeAny;
  if (d.typeName === "ZodDefault") return d.innerType as z.ZodTypeAny;
  return schema;
}

function singular(word: string): string {
  return word.endsWith("s") ? word.slice(0, -1) : word;
}
