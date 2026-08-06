import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
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

const DEV_SIGNED_OUT_COOKIE = "core-plus-dev-signed-out";

export function hasDevelopmentAuthBypass(): boolean {
  return (
    process.env.NODE_ENV !== "production" && Boolean(process.env.AUTH_DEV_EMAIL)
  );
}

async function isDevelopmentAuthSignedOut(): Promise<boolean> {
  if (!hasDevelopmentAuthBypass()) return false;
  return (await cookies()).get(DEV_SIGNED_OUT_COOKIE)?.value === "1";
}

export async function suppressDevelopmentAuth(): Promise<void> {
  if (!hasDevelopmentAuthBypass()) return;
  (await cookies()).set(DEV_SIGNED_OUT_COOKIE, "1", {
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

  const email = process.env.AUTH_DEV_EMAIL;
  if (!email) return null;

  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) return null;

  return { id: row.id, role: row.role, name: row.name, email: row.email };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (session?.user?.id) return session.user as SessionUser;
  return developmentUser();
}

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
