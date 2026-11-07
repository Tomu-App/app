import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import * as schema from "./schema.ts";

export type Db = BunSQLiteDatabase<typeof schema>;

const DEFAULT_MIGRATIONS = join(import.meta.dir, "../../drizzle");

/** Opens (or creates) the database, sets the pragmas and applies pending migrations. */
export function openDb(path: string, migrationsFolder = DEFAULT_MIGRATIONS) {
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.run("pragma journal_mode = WAL");
  sqlite.run("pragma foreign_keys = ON");
  sqlite.run("pragma busy_timeout = 5000");
  const db: Db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, sqlite, close: () => sqlite.close(true) };
}
