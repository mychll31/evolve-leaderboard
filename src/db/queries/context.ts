import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { memberships, teams } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth/guards";
import { getActiveSeason, getStandings, type Standings } from "./standings";

export type AppContext = {
  user: SessionUser;
  standings: Standings;
  /** The signed-in user's own place in the season, if they have one. */
  membershipId: string | null;
  /** Teams this user coaches this season. Empty for members. */
  coachedTeams: { id: string; name: string; color: string }[];
  isCoach: boolean;
  isAdmin: boolean;
};

/**
 * Loads the signed-in user plus the whole season in one place, so screens do
 * not each re-derive it. Redirects to /signin when there is no session and to
 * a holding page when no season is active.
 */
export async function getAppContext(): Promise<AppContext> {
  const user = await requireUser();
  const db = getDb();

  const season = await getActiveSeason(db);
  if (!season) redirect("/no-season");

  const [standings, ownRows] = await Promise.all([
    getStandings(db, season),
    db
      .select({
        id: memberships.id,
        role: memberships.role,
        teamId: teams.id,
        teamName: teams.name,
        teamColor: teams.color,
      })
      .from(memberships)
      .innerJoin(teams, eq(teams.id, memberships.teamId))
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.seasonId, season.id),
        ),
      ),
  ]);

  const coachRows = ownRows.filter((r) => r.role === "coach");
  const memberRow = ownRows.find((r) => r.role === "member");

  return {
    user,
    standings,
    membershipId: memberRow?.id ?? null,
    coachedTeams: coachRows.map((r) => ({
      id: r.teamId,
      name: r.teamName,
      color: r.teamColor,
    })),
    isCoach: coachRows.length > 0 || user.role === "super_admin",
    isAdmin: user.role === "super_admin",
  };
}
