import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  memberships,
  metricEntries,
  scoreSnapshots,
  teams,
  users,
} from "@/db/schema";
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

export type TeamRosterMember = {
  membershipId: string;
  name: string;
  initials: string;
  image: string | null;
  position: string | null;
  score: number;
  rank: number;
  /** Metric ids this member has a logged (non-zero, approved) value for. */
  loggedMetricIds: string[];
  loggedCount: number;
};

export type TeamMetricCoverage = {
  metricId: string;
  key: string;
  name: string;
  /** How many of the team have logged it. */
  logged: number;
};

export type TeamRoster = {
  teamId: string;
  name: string;
  abbr: string;
  color: string;
  coachName: string | null;
  metrics: { metricId: string; key: string; name: string }[];
  members: TeamRosterMember[];
  coverage: TeamMetricCoverage[];
  /** Every member has logged every metric. */
  complete: boolean;
};

/**
 * Who on a team has logged what.
 *
 * Built for the question a Leader actually asks — "who has not done it yet" —
 * so it returns the roster crossed with every active metric rather than the
 * averages `getTeamStandings` gives. A metric counts as logged when there is
 * an approved season-level entry above zero, which is the same test scoring
 * applies, so this can never disagree with the member's own score.
 */
export async function getTeamRoster(
  db: Database,
  standings: Standings,
  teamId: string,
): Promise<TeamRoster | null> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team || team.seasonId !== standings.season.id) return null;

  const [coachRow] = await db
    .select({ name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.teamId, teamId),
        eq(memberships.role, "coach"),
        eq(memberships.active, true),
      ),
    )
    .limit(1);

  const roster = standings.members
    .filter((m) => m.teamId === teamId)
    .sort((a, b) => a.rank - b.rank);

  const metrics = standings.metrics.map((metric) => ({
    metricId: metric.id,
    key: metric.key,
    name: metric.name,
  }));

  const entries =
    roster.length === 0
      ? []
      : await db
          .select({
            membershipId: metricEntries.membershipId,
            metricId: metricEntries.metricId,
            value: metricEntries.value,
          })
          .from(metricEntries)
          .where(
            and(
              eq(metricEntries.seasonId, standings.season.id),
              eq(metricEntries.status, "approved"),
              isNull(metricEntries.meetingId),
              inArray(
                metricEntries.membershipId,
                roster.map((m) => m.membershipId),
              ),
            ),
          );

  const activeMetricIds = new Set(metrics.map((m) => m.metricId));
  const loggedByMember = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.value <= 0 || !activeMetricIds.has(entry.metricId)) continue;
    const set = loggedByMember.get(entry.membershipId) ?? new Set<string>();
    set.add(entry.metricId);
    loggedByMember.set(entry.membershipId, set);
  }

  const members: TeamRosterMember[] = roster.map((member) => {
    const logged = loggedByMember.get(member.membershipId) ?? new Set<string>();
    return {
      membershipId: member.membershipId,
      name: member.name,
      initials: member.initials,
      image: member.image,
      position: member.position,
      score: member.score,
      rank: member.rank,
      loggedMetricIds: [...logged],
      loggedCount: logged.size,
    };
  });

  const coverage: TeamMetricCoverage[] = metrics.map((metric) => ({
    ...metric,
    logged: members.filter((m) => m.loggedMetricIds.includes(metric.metricId))
      .length,
  }));

  return {
    teamId: team.id,
    name: team.name,
    abbr: team.abbr,
    color: team.color,
    coachName: coachRow?.name ?? null,
    metrics,
    members,
    coverage,
    complete:
      members.length > 0 && members.every((m) => m.loggedCount === metrics.length),
  };
}

export type ReportMember = {
  membershipId: string;
  name: string;
  initials: string;
  position: string | null;
  teamId: string;
  teamName: string;
  teamColor: string;
  score: number;
  doneCount: number;
  /** Metric ids already logged, used by report filters. */
  doneMetricIds: string[];
  /** Names of the things still outstanding, in checklist order. */
  missing: string[];
  /** Metric ids still outstanding, in checklist order. */
  missingMetricIds: string[];
};

export type ReportTeam = {
  teamId: string;
  name: string;
  abbr: string;
  color: string;
  members: ReportMember[];
  /** Members who have done everything. */
  finished: number;
};

export type SeasonReport = {
  /** How many things there are to do this season. */
  total: number;
  metrics: { metricId: string; key: string; name: string }[];
  teams: ReportTeam[];
  members: ReportMember[];
  finished: ReportMember[];
  outstanding: ReportMember[];
};

/**
 * Who has done what, across whichever teams the viewer may see.
 *
 * One entries query for the whole scope rather than one per team: a season
 * with ten teams would otherwise make ten round trips to answer a single
 * screen. Scope is decided by the caller — everyone for an admin, their own
 * team for a member — and never inferred here.
 */
export async function getSeasonReport(
  db: Database,
  standings: Standings,
  teamIds: string[] | null,
  metricIds: string[] | null = null,
): Promise<SeasonReport> {
  const roster =
    teamIds === null
      ? standings.members
      : standings.members.filter((m) => teamIds.includes(m.teamId));

  const metricScope =
    metricIds === null
      ? standings.metrics
      : standings.metrics.filter((metric) => metricIds.includes(metric.id));
  const metrics = metricScope.map((metric) => ({
    metricId: metric.id,
    key: metric.key,
    name: metric.name,
  }));
  const total = metrics.length;

  const entries =
    roster.length === 0
      ? []
      : await db
          .select({
            membershipId: metricEntries.membershipId,
            metricId: metricEntries.metricId,
            value: metricEntries.value,
          })
          .from(metricEntries)
          .where(
            and(
              eq(metricEntries.seasonId, standings.season.id),
              eq(metricEntries.status, "approved"),
              isNull(metricEntries.meetingId),
              inArray(
                metricEntries.membershipId,
                roster.map((m) => m.membershipId),
              ),
            ),
          );

  const activeIds = new Set(metrics.map((m) => m.metricId));
  const doneByMember = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.value <= 0 || !activeIds.has(entry.metricId)) continue;
    const set = doneByMember.get(entry.membershipId) ?? new Set<string>();
    set.add(entry.metricId);
    doneByMember.set(entry.membershipId, set);
  }

  const members: ReportMember[] = roster.map((member) => {
    const done = doneByMember.get(member.membershipId) ?? new Set<string>();
    const missing = metrics.filter((m) => !done.has(m.metricId));
    return {
      membershipId: member.membershipId,
      name: member.name,
      initials: member.initials,
      position: member.position,
      teamId: member.teamId,
      teamName: member.teamName,
      teamColor: member.teamColor,
      score: member.score,
      doneCount: done.size,
      doneMetricIds: [...done],
      missing: missing.map((m) => m.name),
      missingMetricIds: missing.map((m) => m.metricId),
    };
  });

  const byTeam = new Map<string, ReportMember[]>();
  for (const member of members) {
    byTeam.set(member.teamId, [...(byTeam.get(member.teamId) ?? []), member]);
  }

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.seasonId, standings.season.id));

  const reportTeams: ReportTeam[] = [...byTeam.entries()]
    .map(([teamId, teamMembers]) => {
      const row = teamRows.find((t) => t.id === teamId);
      return {
        teamId,
        name: row?.name ?? teamMembers[0].teamName,
        abbr: row?.abbr ?? "",
        color: row?.color ?? teamMembers[0].teamColor,
        members: [...teamMembers].sort(
          (a, b) => a.doneCount - b.doneCount || a.name.localeCompare(b.name),
        ),
        finished: teamMembers.filter((m) => m.doneCount === total).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    total,
    metrics,
    teams: reportTeams,
    members,
    finished: members
      .filter((m) => total > 0 && m.doneCount === total)
      .sort((a, b) => a.name.localeCompare(b.name)),
    outstanding: members
      .filter((m) => total === 0 || m.doneCount < total)
      .sort((a, b) => a.doneCount - b.doneCount || a.name.localeCompare(b.name)),
  };
}
