import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ConflictError, NotFoundError } from "./guards";

/**
 * The deployment is a public URL and the set of member email addresses is
 * guessable, so an unthrottled password form would be strictly weaker than the
 * Google-only sign-in it sits beside.
 *
 * Locking the account rather than the IP address is the only throttle that
 * works with no shared store between serverless invocations. It accepts that
 * someone who knows an address can lock its owner out for the window; anyone
 * with Google linked is unaffected, because the lock only gates this path.
 */
export const MAX_FAILED_ATTEMPTS = 10;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/** Shortest password we will store. Length is the part that matters. */
export const MIN_PASSWORD_LENGTH = 10;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Spends roughly what a real verification spends, for the paths where there is
 * no hash to check against.
 *
 * Without it, an address that is not on the roster answers measurably faster
 * than one that is, and the sign-in form becomes a way to enumerate members.
 */
async function burnVerificationTime(): Promise<void> {
  await scryptAsync("", randomBytes(16), 64);
}

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "super_admin" | "user";
};

/**
 * The whole of the credentials check: roster membership, lockout, and password.
 *
 * Returns null for every kind of failure. The caller cannot distinguish "no
 * such account" from "wrong password" from "locked", and neither can the person
 * signing in — the sign-in page shows one message for all three.
 */
export async function authenticateWithPassword(
  db: Database,
  input: { email: string; password: string },
): Promise<AuthenticatedUser | null> {
  const email = input.email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user?.passwordHash) {
    await burnVerificationTime();
    return null;
  }

  if (user.passwordLockedUntil && user.passwordLockedUntil > new Date()) {
    await burnVerificationTime();
    return null;
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    const attempts = user.passwordFailedAttempts + 1;
    await db
      .update(users)
      .set({
        passwordFailedAttempts: attempts,
        passwordLockedUntil:
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCK_DURATION_MS)
            : user.passwordLockedUntil,
      })
      .where(eq(users.id, user.id));
    return null;
  }

  await db
    .update(users)
    .set({ passwordFailedAttempts: 0, passwordLockedUntil: null })
    .where(eq(users.id, user.id));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
  };
}

/**
 * Writes a new password and lifts any lockout, because whoever can set the
 * password owns the account and should not then be locked out of it.
 *
 * Establishing that right is the caller's job: a valid set-password token, or
 * a signed-in session that has already re-entered its current password.
 */
export async function setPassword(
  db: Database,
  userId: string,
  plain: string,
): Promise<void> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new ConflictError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError("Account");

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(plain),
      passwordFailedAttempts: 0,
      passwordLockedUntil: null,
    })
    .where(eq(users.id, userId));
}

