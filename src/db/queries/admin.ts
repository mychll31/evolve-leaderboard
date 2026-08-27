import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  penalties,
  seasons,
  teams,
  users,
} from "@/db/schema";

export type SeasonSummary = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "draft" | "active" | "locked" | "archived";
  formula: "weighted" | "points" | "average";
  teamCount: number;
  memberCount: number;
  meetingCount: number;
};

export async function listSeasons(db: Database): Promise<SeasonSummary[]> {
  const [seasonRows, teamCounts, memberCounts, meetingCounts] =
    await Promise.all([
      db.select().from(seasons).orderBy(desc(seasons.startsOn)),
      db
        .select({ seasonId: teams.seasonId, n: sql<number>`count(*)` })
        .from(teams)
        .groupBy(teams.seasonId),
      db
        .select({ seasonId: memberships.seasonId, n: sql<number>`count(*)` })
        .from(memberships)
        .where(and(eq(memberships.role, "member"), eq(memberships.active, true)))
        .groupBy(memberships.seasonId),
      db
        .select({ seasonId: meetings.seasonId, n: sql<number>`count(*)` })
        .from(meetings)
        .groupBy(meetings.seasonId),
    ]);

  const lookup = (rows: { seasonId: string; n: number }[], id: string) =>
    Number(rows.find((r) => r.seasonId === id)?.n ?? 0);

  return seasonRows.map((season) => ({
    id: season.id,
    name: season.name,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    status: season.status,
    formula: season.formula,
    teamCount: lookup(teamCounts, season.id),
    memberCount: lookup(memberCounts, season.id),
    meetingCount: lookup(meetingCounts, season.id),
  }));
}

export type MeetingRow = {
  id: string;
  meetsOn: string;
  startsAt: Date;
  lateAfterMinutes: number;
  label: string | null;
  status: "scheduled" | "held" | "cancelled";
  /** Attendance already recorded — blocks deletion. */
  entryCount: number;
  presentCount: number;
};

export async function listMeetings(
  db: Database,
  seasonId: string,
): Promise<MeetingRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(meetings)
      .where(eq(meetings.seasonId, seasonId))
      .orderBy(asc(meetings.meetsOn)),
    db
      .select({
        meetingId: metricEntries.meetingId,
        n: sql<number>`count(*)`,
        present: sql<number>`sum(case when ${metricEntries.status} = 'approved' and ${metricEntries.value} > 0 then 1 else 0 end)`,
      })
      .from(metricEntries)
      .where(eq(metricEntries.seasonId, seasonId))
      .groupBy(metricEntries.meetingId),
  ]);

  return rows.map((meeting) => {
    const count = counts.find((c) => c.meetingId === meeting.id);
    return {
      id: meeting.id,
      meetsOn: meeting.meetsOn,
      startsAt: meeting.startsAt,
      lateAfterMinutes: meeting.lateAfterMinutes,
      label: meeting.label,
      status: meeting.status,
      entryCount: Number(count?.n ?? 0),
      presentCount: Number(count?.present ?? 0),
    };
  });
}

export type TeamRow = {
  id: string;
  name: string;
  abbr: string;
  color: string;
  sortOrder: number;
  coachName: string | null;
  coachUserId: string | null;
  memberCount: number;
};

export async function listTeams(
  db: Database,
  seasonId: string,
): Promise<TeamRow[]> {
  const [teamRows, membershipRows] = await Promise.all([
    db
      .select()
      .from(teams)
      .where(eq(teams.seasonId, seasonId))
      .orderBy(asc(teams.sortOrder)),
    db
      .select({
        teamId: memberships.teamId,
        userId: memberships.userId,
        role: memberships.role,
        active: memberships.active,
        name: users.name,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.seasonId, seasonId)),
  ]);

  return teamRows.map((team) => {
    const roster = membershipRows.filter((m) => m.teamId === team.id && m.active);
    const coach = roster.find((m) => m.role === "coach");
    return {
      id: team.id,
      name: team.name,
      abbr: team.abbr,
      color: team.color,
      sortOrder: team.sortOrder,
      coachName: coach?.name ?? null,
      coachUserId: coach?.userId ?? null,
      memberCount: roster.filter((m) => m.role === "member").length,
    };
  });
}

export type PersonRow = {
  userId: string;
  name: string;
  email: string;
  globalRole: "super_admin" | "user";
  membershipId: string | null;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  seasonRole: "member" | "coach" | null;
  position: string | null;
  active: boolean;
};

/**
 * Everyone in the system, with their place in this season if they have one.
 * Users with no membership still appear so an admin can assign them.
 */
export async function listPeople(
  db: Database,
  seasonId: string,
): Promise<PersonRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      globalRole: users.role,
      membershipId: memberships.id,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
      seasonRole: memberships.role,
      position: memberships.position,
      active: memberships.active,
    })
    .from(users)
    .leftJoin(
      memberships,
      and(
        eq(memberships.userId, users.id),
        eq(memberships.seasonId, seasonId),
      ),
    )
    .leftJoin(teams, eq(teams.id, memberships.teamId))
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name ?? "",
    email: row.email ?? "",
    globalRole: row.globalRole,
    membershipId: row.membershipId,
    teamId: row.active ? row.teamId : null,
    teamName: row.active ? row.teamName : null,
    teamColor: row.active ? row.teamColor : null,
    seasonRole: row.seasonRole,
    position: row.position,
    active: row.active ?? false,
  }));
}

export type MetricRow = {
  id: string;
  key: string;
  name: string;
  type: "percentage" | "integer" | "decimal" | "boolean" | "manual_score";
  weight: number;
  target: number | null;
  required: boolean;
  sortOrder: number;
  active: boolean;
  /** Once true, the metric's type is frozen. */
  hasEntries: boolean;
};

export async function listMetrics(
  db: Database,
  seasonId: string,
): Promise<MetricRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(metrics)
      .where(eq(metrics.seasonId, seasonId))
      .orderBy(asc(metrics.sortOrder)),
    db
      .select({ metricId: metricEntries.metricId, n: sql<number>`count(*)` })
      .from(metricEntries)
      .where(eq(metricEntries.seasonId, seasonId))
      .groupBy(metricEntries.metricId),
  ]);

  return rows.map((metric) => ({
    id: metric.id,
    key: metric.key,
    name: metric.name,
    type: metric.type,
    weight: metric.weight,
    target: metric.target,
    required: metric.required,
    sortOrder: metric.sortOrder,
    active: metric.active,
    hasEntries: Number(
      counts.find((c) => c.metricId === metric.id)?.n ?? 0,
    ) > 0,
  }));
}

export type PenaltyRow = {
  id: string;
  membershipId: string;
  memberName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  /** Positive magnitude that was taken off. */
  points: number;
  reason: string | null;
  issuedByName: string | null;
  issuedAt: Date;
};

/**
 * Every deduction issued this season, newest first.
 *
 * Returned as a flat list rather than grouped by member because the admin
 * screen needs both views — the running total per person and the individual
 * sanctions behind it — and grouping in the client keeps this one query.
 */
export async function listPenalties(
  db: Database,
  seasonId: string,
): Promise<PenaltyRow[]> {
  const rows = await db
    .select({
      id: penalties.id,
      membershipId: penalties.membershipId,
      memberName: users.name,
      memberEmail: users.email,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
      points: penalties.points,
      reason: penalties.reason,
      issuedBy: penalties.issuedBy,
      issuedAt: penalties.issuedAt,
    })
    .from(penalties)
    .innerJoin(memberships, eq(memberships.id, penalties.membershipId))
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(penalties.seasonId, seasonId))
    .orderBy(desc(penalties.issuedAt));

  // Who issued each one is resolved in a second bounded query rather than a
  // fourth join: `users` is already joined here for the member, and aliasing
  // it again for the issuer defeats the query builder's type inference.
  const issuerIds = [
    ...new Set(rows.map((row) => row.issuedBy).filter((id) => id !== null)),
  ];
  const issuers =
    issuerIds.length === 0
      ? []
      : await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, issuerIds));
  const issuerName = new Map(issuers.map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    id: row.id,
    membershipId: row.membershipId,
    memberName: row.memberName ?? row.memberEmail ?? "Unknown",
    teamId: row.teamId,
    teamName: row.teamName,
    teamColor: row.teamColor,
    points: row.points,
    reason: row.reason,
    issuedByName: row.issuedBy ? (issuerName.get(row.issuedBy) ?? null) : null,
    issuedAt: row.issuedAt,
  }));
}

export type PenaltyTargetRow = {
  membershipId: string;
  name: string;
  teamId: string;
  teamName: string;
  teamColor: string;
};

/**
 * Who can be docked: active, scored members of the season.
 *
 * Leaders are left out because they carry no score — a deduction against one
 * would be recorded and then never show up anywhere.
 */
export async function listPenaltyTargets(
  db: Database,
  seasonId: string,
): Promise<PenaltyTargetRow[]> {
  const rows = await db
    .select({
      membershipId: memberships.id,
      name: users.name,
      email: users.email,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
    })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.seasonId, seasonId),
        eq(memberships.role, "member"),
        eq(memberships.active, true),
      ),
    )
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    membershipId: row.membershipId,
    name: row.name ?? row.email ?? "Unknown",
    teamId: row.teamId,
    teamName: row.teamName,
    teamColor: row.teamColor,
  }));
}
