import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  scoreSnapshots,
  seasons,
  teams,
  users,
} from "@/db/schema";
import { rankMembers } from "@/domain/ranking";
import { scoreBreakdown } from "@/domain/scoring";
import { combine } from "@/domain/scoring/combine";
import { currentStreak } from "@/domain/streaks";
import type { Entry, Meeting, Metric } from "@/domain/types";

export type SeasonRow = typeof seasons.$inferSelect;

export type BreakdownPart = {
  metricId: string;
  key: string;
  name: string;
  weight: number;
  /** In the metric's own units — 7 assignments, 93 percent. */
  raw: number;
  /** Normalised 0-100, the value that actually feeds the formula. */
  value: number;
};

export type MemberStanding = {
  membershipId: string;
  userId: string;
  name: string;
  initials: string;
  position: string | null;
  teamId: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  score: number;
  rank: number;
  /** Rank at the most recent weekly snapshot; null before the first one. */
  prevRank: number | null;
  /** Positive means climbed. */
  delta: number;
  streak: number;
  breakdown: BreakdownPart[];
};

/** Per-session attendance roll-up, feeding both the trend and the heatmap. */
export type MeetingAttendance = {
  meetingId: string;
  meetsOn: string;
  present: number;
  total: number;
};

export type Standings = {
  season: SeasonRow;
  metrics: Metric[];
  meetings: Meeting[];
  heldCount: number;
  weekNo: number;
  daysLeft: number;
  memberCount: number;
  teamCount: number;
  members: MemberStanding[];
  attendanceByMeeting: MeetingAttendance[];
};

const DAY_MS = 86_400_000;

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function getActiveSeason(db: Database): Promise<SeasonRow | null> {
  const [row] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.status, "active"))
    .orderBy(desc(seasons.startsOn))
    .limit(1);
  return row ?? null;
}

/**
 * The single source of truth every screen reads from.
 *
 * Five bounded queries, then all scoring, ranking and streak work happens in
 * the pure domain layer. Turso is a network hop, so the thing to avoid is not
 * volume but *chattiness* — one query per player would be an order of
 * magnitude slower than loading every entry at once.
 */
export async function getStandings(
  db: Database,
  season: SeasonRow,
  now: Date = new Date(),
): Promise<Standings> {
  const [metricRows, meetingRows, memberRows, entryRows, snapshotRows] =
    await Promise.all([
      db
        .select()
        .from(metrics)
        .where(and(eq(metrics.seasonId, season.id), eq(metrics.active, true)))
        .orderBy(metrics.sortOrder),
      db.select().from(meetings).where(eq(meetings.seasonId, season.id)),
      db
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          position: memberships.position,
          teamId: teams.id,
          teamName: teams.name,
          teamAbbr: teams.abbr,
          teamColor: teams.color,
          name: users.name,
          email: users.email,
        })
        .from(memberships)
        .innerJoin(teams, eq(teams.id, memberships.teamId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.seasonId, season.id),
            eq(memberships.role, "member"),
            eq(memberships.active, true),
          ),
        ),
      db
        .select({
          membershipId: metricEntries.membershipId,
          metricId: metricEntries.metricId,
          meetingId: metricEntries.meetingId,
          value: metricEntries.value,
          status: metricEntries.status,
        })
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.seasonId, season.id),
            eq(metricEntries.status, "approved"),
          ),
        ),
      db
        .select()
        .from(scoreSnapshots)
        .where(eq(scoreSnapshots.seasonId, season.id)),
    ]);

  const metricDefs: Metric[] = metricRows.map((m) => ({
    id: m.id,
    key: m.key,
    name: m.name,
    type: m.type,
    weight: m.weight,
    target: m.target,
  }));

  const meetingDefs: Meeting[] = meetingRows.map((m) => ({
    id: m.id,
    meetsOn: m.meetsOn,
    status: m.status,
  }));
  const heldCount = meetingDefs.filter((m) => m.status === "held").length;

  const attendanceMetricId = metricDefs.find((m) => m.key === "attendance")?.id;

  // Bucket entries by member once, rather than filtering the full list per
  // member (which would be O(members x entries)).
  const byMember = new Map<string, Entry[]>();
  for (const row of entryRows) {
    const list = byMember.get(row.membershipId);
    const entry: Entry = {
      metricId: row.metricId,
      meetingId: row.meetingId,
      value: row.value,
      status: row.status,
    };
    if (list) list.push(entry);
    else byMember.set(row.membershipId, [entry]);
  }

  // Most recent snapshot per member supplies the delta arrows.
  const latestWeek = snapshotRows.reduce((max, s) => Math.max(max, s.weekNo), 0);
  const prevRankByMember = new Map<string, number>();
  for (const snapshot of snapshotRows) {
    if (snapshot.weekNo === latestWeek) {
      prevRankByMember.set(snapshot.membershipId, snapshot.rank);
    }
  }

  const scored = memberRows.map((row) => {
    const entries = byMember.get(row.membershipId) ?? [];
    const parts = scoreBreakdown(metricDefs, entries, heldCount);
    const score = combine(
      parts.map((p) => ({ weight: p.metric.weight, value: p.value })),
      season.formula,
    );
    const attendance =
      parts.find((p) => p.metric.key === "attendance")?.value ?? 0;
    const streak = attendanceMetricId
      ? currentStreak(
          meetingDefs,
          entries.filter((e) => e.metricId === attendanceMetricId),
        )
      : 0;

    return {
      row,
      score,
      attendance,
      streak,
      breakdown: parts.map<BreakdownPart>((p) => ({
        metricId: p.metric.id,
        key: p.metric.key,
        name: p.metric.name,
        weight: p.metric.weight,
        raw: p.raw,
        value: p.value,
      })),
    };
  });

  const ranked = rankMembers(
    scored.map((s) => ({
      membershipId: s.row.membershipId,
      score: s.score,
      attendance: s.attendance,
      name: s.row.name ?? "",
    })),
  );
  const rankByMember = new Map(ranked.map((r) => [r.membershipId, r.rank]));

  const members: MemberStanding[] = scored
    .map((s) => {
      const rank = rankByMember.get(s.row.membershipId) ?? 0;
      const prevRank = prevRankByMember.get(s.row.membershipId) ?? null;
      const name = s.row.name ?? s.row.email ?? "Unknown";
      return {
        membershipId: s.row.membershipId,
        userId: s.row.userId,
        name,
        initials: initials(name),
        position: s.row.position,
        teamId: s.row.teamId,
        teamName: s.row.teamName,
        teamAbbr: s.row.teamAbbr,
        teamColor: s.row.teamColor,
        score: s.score,
        rank,
        prevRank,
        delta: prevRank === null ? 0 : prevRank - rank,
        streak: s.streak,
        breakdown: s.breakdown,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  // Attendance per session, computed from the entries already in memory
  // rather than with another query per meeting.
  const presentByMeeting = new Map<string, number>();
  if (attendanceMetricId) {
    for (const row of entryRows) {
      if (row.metricId !== attendanceMetricId || !row.meetingId) continue;
      if (row.value <= 0) continue;
      presentByMeeting.set(
        row.meetingId,
        (presentByMeeting.get(row.meetingId) ?? 0) + 1,
      );
    }
  }
  const attendanceByMeeting: MeetingAttendance[] = meetingDefs
    .filter((m) => m.status === "held")
    .sort((a, b) => a.meetsOn.localeCompare(b.meetsOn))
    .map((m) => ({
      meetingId: m.id,
      meetsOn: m.meetsOn,
      present: presentByMeeting.get(m.id) ?? 0,
      total: memberRows.length,
    }));

  const today = isoToday(now);
  const elapsed = daysBetween(season.startsOn, today);
  const teamCount = new Set(memberRows.map((m) => m.teamId)).size;

  return {
    season,
    metrics: metricDefs,
    meetings: meetingDefs,
    heldCount,
    weekNo: Math.max(1, Math.floor(elapsed / 7) + 1),
    daysLeft: Math.max(0, daysBetween(today, season.endsOn)),
    memberCount: memberRows.length,
    teamCount,
    members,
    attendanceByMeeting,
  };
}
