import { redirect } from "next/navigation";
import { auth } from "./config";
import type { Actor } from "./scoping";

export type SessionUser = Actor & {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
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
