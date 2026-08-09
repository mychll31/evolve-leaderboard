import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships } from "@/db/schema";

export type Actor = {
  id: string;
  role: "super_admin" | "user";
};

export class AuthorizationError extends Error {
  constructor(message = "Not permitted") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Authorisation logic, deliberately split from the session layer so it can be
 * tested against a real database without faking a request.
 */

/** Teams this user coaches in a season. Empty for members. */
export async function coachTeamIds(
  db: Database,
  userId: string,
  seasonId: string,
): Promise<string[]> {
  const rows = await db
    .select({ teamId: memberships.teamId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.seasonId, seasonId),
        eq(memberships.role, "coach"),
      ),
    );
  return rows.map((r) => r.teamId);
}

/**
 * Whether an actor may record or decide entries for a given membership.
 *
 * Resolved by querying the target's team and checking for a coach membership
 * on it — never by trusting a team id supplied by the caller.
 */
export async function canManageMembership(
  db: Database,
  actor: Actor,
  membershipId: string,
): Promise<boolean> {
  if (actor.role === "super_admin") return true;

  const [target] = await db
    .select({ teamId: memberships.teamId, seasonId: memberships.seasonId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!target) return false;

  const [coaching] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, actor.id),
        eq(memberships.seasonId, target.seasonId),
        eq(memberships.teamId, target.teamId),
        eq(memberships.role, "coach"),
      ),
    )
    .limit(1);

  return Boolean(coaching);
}

export async function assertCanManageMembership(
  db: Database,
  actor: Actor,
  membershipId: string,
): Promise<void> {
  if (!(await canManageMembership(db, actor, membershipId))) {
    throw new AuthorizationError("You do not lead this member's team");
  }
}

/** The membership row belonging to this user in a season, if any. */
export async function ownMembership(
  db: Database,
  userId: string,
  seasonId: string,
) {
  const [row] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.seasonId, seasonId)),
    )
    .limit(1);
  return row ?? null;
}
