import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users, verificationTokens } from "@/db/schema";
import { NotFoundError } from "./guards";

/**
 * One-time links that let someone set their own password.
 *
 * There is no email delivery configured anywhere in this application, so an
 * admin mints the link and hands it over. That is also why it doubles as the
 * password reset path: there is nothing else to reset through.
 *
 * These live in Auth.js's `verificationToken` table, which is otherwise unused
 * because no email provider is configured. The identifier is namespaced so
 * these rows can never be confused with Auth.js's own if one is ever added.
 */
const IDENTIFIER_PREFIX = "set-password:";
const TOKEN_BYTES = 32;
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function identifierFor(userId: string): string {
  return `${IDENTIFIER_PREFIX}${userId}`;
}

/**
 * Minting invalidates any earlier link for the same person, so a re-issued
 * link cannot be raced by one sent out weeks ago.
 */
export async function mintPasswordSetupToken(
  db: Database,
  userId: string,
): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError("Account");

  const identifier = identifierFor(userId);
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, identifier));

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await db.insert(verificationTokens).values({
    identifier,
    token,
    expires: new Date(Date.now() + LIFETIME_MS),
  });

  return token;
}

/**
 * Reads the token without spending it, so the set-password page can tell
 * whether to draw a form or an expired-link message. Spending it on a page view
 * would invalidate the very form it was rendering.
 */
export async function peekPasswordSetupToken(
  db: Database,
  token: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);

  if (!row?.identifier.startsWith(IDENTIFIER_PREFIX)) return null;
  if (row.expires <= new Date()) return null;

  return row.identifier.slice(IDENTIFIER_PREFIX.length);
}

/**
 * Returns the user the token belongs to, and spends it. Null for anything
 * unknown, expired, or already used — the page shows one message for all of
 * them, since telling them apart only helps someone guessing.
 */
export async function consumePasswordSetupToken(
  db: Database,
  token: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);

  if (!row?.identifier.startsWith(IDENTIFIER_PREFIX)) return null;

  // Spent either way: an expired row has no further use, and deleting it here
  // keeps the table from accumulating dead links nobody ever cleans up.
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, row.identifier),
        eq(verificationTokens.token, token),
      ),
    );

  if (row.expires <= new Date()) return null;

  return row.identifier.slice(IDENTIFIER_PREFIX.length);
}
