import "dotenv/config";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "./client";

/**
 * Applies migrations through the Drizzle migrator rather than `drizzle-kit
 * migrate`, because drizzle-kit's `turso` dialect insists on an auth token
 * even when the URL is a local `file:` database. The migrator takes whatever
 * the client is already connected to, so one command covers local development
 * and a real Turso deploy.
 */
await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.log(`Migrations applied to ${process.env.TURSO_DATABASE_URL}`);
