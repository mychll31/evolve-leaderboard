import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, type Database } from "@/db/client";

export type TestDb = {
  db: Database;
  cleanup: () => Promise<void>;
};

/**
 * A migrated, throwaway libSQL file database. Tests never touch Turso — the
 * same driver serves a local file, so this is the real schema, not a mock.
 */
export async function makeTestDb(): Promise<TestDb> {
  const dir = await mkdtemp(join(tmpdir(), "coreplus-test-"));
  const db = createDb(`file:${join(dir, "test.db")}`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return {
    db,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
