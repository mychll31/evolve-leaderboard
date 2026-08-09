import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "./config";
import type { Actor } from "./scoping";

export type SessionUser = Actor & {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const DEV_SIGNED_OUT_COOKIE = "leaderboard-dev-signed-out";
const DEV_USER_COOKIE = "leaderboard-dev-user";

/**
 * Enabled by `AUTH_DEV_LOGIN=true` (which offers the account picker) or by
 * `AUTH_DEV_EMAIL` (which signs a single account in automatically). Either way
 * it is dead in a production build.
 */
export function hasDevelopmentAuthBypass(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (
    process.env.AUTH_DEV_LOGIN === "true" || Boolean(process.env.AUTH_DEV_EMAIL)
  );
}

async function isDevelopmentAuthSignedOut(): Promise<boolean> {
  if (!hasDevelopmentAuthBypass()) return false;
  return (await cookies()).get(DEV_SIGNED_OUT_COOKIE)?.value === "1";
}

export async function suppressDevelopmentAuth(): Promise<void> {
  if (!hasDevelopmentAuthBypass()) return;
  const jar = await cookies();
  jar.delete(DEV_USER_COOKIE);
  jar.set(DEV_SIGNED_OUT_COOKIE, "1", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
}

/**
 * Signs in as a specific seeded account. Stores the user id rather than the
 * email so the value is opaque, and it is validated against the database on
 * every request regardless.
 */
export async function setDevelopmentUser(userId: string): Promise<void> {
  if (!hasDevelopmentAuthBypass()) return;
  const jar = await cookies();
  jar.delete(DEV_SIGNED_OUT_COOKIE);
  jar.set(DEV_USER_COOKIE, userId, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
}

/**
 * Local development escape hatch, so the app can be run without configuring
 * Google OAuth first.
 *
 * Deliberately double-guarded: it is unreachable unless the build is a
 * development build AND `AUTH_DEV_EMAIL` is explicitly set, and even then it
 * only impersonates a user who already exists in the database. It is compiled
 * out of any production build by the NODE_ENV check.
 */
async function developmentUser(): Promise<SessionUser | null> {
  if (!hasDevelopmentAuthBypass()) return null;
  if (await isDevelopmentAuthSignedOut()) return null;

  // A picked account wins over the env default, so switching roles in the UI
  // does not require editing .env and restarting.
  const pickedId = (await cookies()).get(DEV_USER_COOKIE)?.value;
  const db = getDb();

  if (pickedId) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, pickedId))
      .limit(1);
    if (row) {
      return { id: row.id, role: row.role, name: row.name, email: row.email };
    }
    // Cookie points at a user who no longer exists — e.g. after a reseed.
    // Fall through to the env default rather than stranding the session.
  }

  const email = process.env.AUTH_DEV_EMAIL;
  if (!email) return null;

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) return null;

  return { id: row.id, role: row.role, name: row.name, email: row.email };
}

/**
 * Wrapped in React's request cache so resolving the session costs one database
 * round trip per request however many callers ask for it. The layout needs the
 * user id before it can count notifications, and the page needs it again for
 * the app context — without this that is two session lookups.
 */
export const getSessionUser = cache(
  async function getSessionUser(): Promise<SessionUser | null> {
    const session = await auth();
    if (session?.user?.id) return session.user as SessionUser;
    return developmentUser();
  },
);

/**
 * Route protection lives here rather than in middleware.
 *
 * Sessions are database-backed, so validating one means a query. Doing that in
 * edge middleware would add a round trip to every request including static
 * assets, and the guard would still be needed in each Server Action anyway —
 * middleware protects routes, not data.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/dashboard");
  return user;
}
