import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, scoreSnapshots, teams, users } from "@/db/schema";
import type { MemberStanding, Standings } from "./standings";

export type TeamMetricAverage = {
  key: string;
  name: string;
  /** Normalised 0-100 mean across the team's members. */
  value: number;
};

export type TeamStanding = {
  teamId: string;
  name: string;
  abbr: string;
  color: string;
  rank: number;
  /** Sum of member scores — the prototype's arbitrary `score x 21` is gone. */
  points: number;
  coachName: string | null;
  memberCount: number;
  /** Weeks this team finished top of the weekly team standings. */
  wins: number;
  metricAverages: TeamMetricAverage[];
  topPlayer: MemberStanding | null;
  bottomPlayer: MemberStanding | null;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Counts weeks each team finished first — confirmed with the product owner as
 * the meaning of "15W" on the team cards, which the prototype hardcoded.
 *
 * A week is won by the team with the highest total member score in that week's
 * snapshot. That is deliberately the same basis as `points` below, so a team's
 * win count and its displayed total can never tell different stories.
 */
async function winsByTeam(
  db: Database,
  seasonId: string,
  teamOfMembership: Map<string, string>,
): Promise<Map<string, number>> {
  const snapshots = await db
    .select({
      membershipId: scoreSnapshots.membershipId,
      weekNo: scoreSnapshots.weekNo,
      score: scoreSnapshots.score,
    })
    .from(scoreSnapshots)
    .where(eq(scoreSnapshots.seasonId, seasonId));

  const byWeek = new Map<number, Map<string, number>>();
  for (const snapshot of snapshots) {
    const teamId = teamOfMembership.get(snapshot.membershipId);
    if (!teamId) continue;
    const week = byWeek.get(snapshot.weekNo) ?? new Map<string, number>();
    week.set(teamId, (week.get(teamId) ?? 0) + snapshot.score);
    byWeek.set(snapshot.weekNo, week);
  }

  const wins = new Map<string, number>();
  for (const totals of byWeek.values()) {
    let bestTeam: string | null = null;
    let bestScore = -Infinity;
    for (const [teamId, total] of totals) {
      if (total > bestScore) {
        bestScore = total;
        bestTeam = teamId;
      }
    }
    if (bestTeam) wins.set(bestTeam, (wins.get(bestTeam) ?? 0) + 1);
  }
  return wins;
}

export async function getTeamStandings(
  db: Database,
  standings: Standings,
): Promise<TeamStanding[]> {
  const teamOfMembership = new Map(
    standings.members.map((m) => [m.membershipId, m.teamId]),
  );

  const [teamRows, coachRows, wins] = await Promise.all([
    db
      .select()
      .from(teams)
      .where(eq(teams.seasonId, standings.season.id))
      .orderBy(teams.sortOrder),
    db
      .select({ teamId: memberships.teamId, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.seasonId, standings.season.id),
          eq(memberships.role, "coach"),
        ),
      ),
    winsByTeam(db, standings.season.id, teamOfMembership),
  ]);

  const coachByTeam = new Map(coachRows.map((c) => [c.teamId, c.name]));

  const rows = teamRows.map((team) => {
    const roster = standings.members
      .filter((m) => m.teamId === team.id)
      .sort((a, b) => a.rank - b.rank);

    return {
      teamId: team.id,
      name: team.name,
      abbr: team.abbr,
      color: team.color,
      rank: 0,
      points: roster.reduce((sum, m) => sum + m.score, 0),
      coachName: coachByTeam.get(team.id) ?? null,
      memberCount: roster.length,
      wins: wins.get(team.id) ?? 0,
      metricAverages: standings.metrics.map<TeamMetricAverage>((metric) => ({
        key: metric.key,
        name: metric.name,
        value: mean(
          roster.map(
            (m) => m.breakdown.find((b) => b.key === metric.key)?.value ?? 0,
          ),
        ),
      })),
      topPlayer: roster[0] ?? null,
      bottomPlayer: roster.length > 1 ? roster[roster.length - 1] : null,
    };
  });

  return rows
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .map((team, i) => ({ ...team, rank: i + 1 }));
}
