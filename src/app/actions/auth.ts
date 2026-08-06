"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { signOut } from "@/lib/auth/config";
import {
  hasDevelopmentAuthBypass,
  setDevelopmentUser,
  suppressDevelopmentAuth,
} from "@/lib/auth/guards";

/**
 * Sign out via a Server Action rather than posting a form straight at
 * `/api/auth/signout`.
 *
 * That endpoint requires Auth.js's CSRF token in the request body; a bare form
 * POST returns a 500. Going through `signOut()` handles the token, clears the
 * database session and redirects, and cannot drift out of sync with the
 * provider config.
 */
export async function signOutAction(): Promise<void> {
  await suppressDevelopmentAuth();
  await signOut({ redirectTo: "/signin" });
}

/**
 * Development-only: sign in as a seeded account without Google.
 *
 * Guarded three ways — `hasDevelopmentAuthBypass()` is false in any production
 * build, the account must already exist in the database, and the cookie stores
 * an opaque id that is re-validated on every request. There is no path from
 * here to a session for an account that was not already authorised.
 */
export async function signInAsAction(userId: string): Promise<void> {
  if (!hasDevelopmentAuthBypass()) {
    throw new Error("Development sign-in is not available");
  }

  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new Error("No such account");

  await setDevelopmentUser(row.id);
  redirect("/dashboard");
}
