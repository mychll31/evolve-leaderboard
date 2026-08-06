import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * The same driver handles a local `file:` URL and a remote Turso URL, so local
 * development needs no Turso credentials and no separate driver.
 */
export function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

function resolveUrl(): string {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Copy .env.example to .env — the default `file:./local.db` needs no Turso account.",
    );
  }
  return url;
}

let cached: Database | undefined;

/**
 * Lazily built so that importing this module never throws at build time,
 * and so serverless invocations reuse one client per warm instance.
 */
export function getDb(): Database {
  cached ??= createDb(resolveUrl(), process.env.TURSO_AUTH_TOKEN || undefined);
  return cached;
}
