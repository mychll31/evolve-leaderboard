import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";

/**
 * Grants super admin to an email address, creating the account if needed.
 *
 * This exists because the admin console cannot bootstrap itself: `/admin/people`
 * requires you to already be a super admin, so a freshly-migrated production
 * database has no route to its first one. Direct database access is the right
 * trust level for that — the same as running migrations.
 *
 *   npm run admin:add -- someone@example.com "Their Name"
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const [rawEmail, rawName] = process.argv.slice(2);

if (!rawEmail) {
  console.error("Usage: npm run admin:add -- <email> [name]");
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();
if (!EMAIL.test(email)) {
  console.error(`"${rawEmail}" is not a valid email address.`);
  process.exit(1);
}

// Default the display name to the local part, title-cased, so the sidebar and
// player cards have something readable before anyone edits it.
const name =
  rawName?.trim() ||
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

const db = getDb();

const [existing] = await db
  .select({ id: users.id, name: users.name, role: users.role })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (existing) {
  if (existing.role === "super_admin") {
    console.log(`${email} is already a super admin. Nothing to do.`);
  } else {
    await db
      .update(users)
      .set({ role: "super_admin" })
      .where(eq(users.id, existing.id));
    console.log(`Promoted ${existing.name ?? email} to super admin.`);
  }
} else {
  await db.insert(users).values({ name, email, role: "super_admin" });
  console.log(`Created ${name} <${email}> as a super admin.`);
}

console.log(
  "\nThey can now sign in with the Google account for that exact address.",
);
console.log(
  "To give them a player card as well, assign them a team at /admin/people.",
);
