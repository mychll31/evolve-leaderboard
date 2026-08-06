"use server";

import { signOut } from "@/lib/auth/config";
import { suppressDevelopmentAuth } from "@/lib/auth/guards";

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
