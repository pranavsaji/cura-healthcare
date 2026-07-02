import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

/**
 * Create a Drizzle client. In-memory / connectionless callers (tests, the
 * mock-only dev path) can skip this and use the repositories against a stub.
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  return drizzle(sql, { schema });
}

export { schema };
