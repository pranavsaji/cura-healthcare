import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/schema.js";
import type { Database } from "../src/client.js";

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

export interface TestDb {
  db: Database;
  /** Raw client for asserting on-disk (ciphertext) state. */
  sql: ReturnType<typeof postgres>;
  stop: () => Promise<void>;
}

/**
 * Spin up a throwaway Postgres, apply the committed migrations, and return a
 * Drizzle client. Used only by `*.int.spec.ts` (Docker required; excluded from
 * the default unit run).
 */
export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();
  const url = container.getConnectionUri();

  const migrator = postgres(url, { max: 1 });
  await migrate(drizzle(migrator), { migrationsFolder: MIGRATIONS });
  await migrator.end();

  const sql = postgres(url, { max: 5 });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    stop: async () => {
      await sql.end();
      await container.stop();
    },
  };
}
