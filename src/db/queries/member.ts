import { aliasedTable, and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  teams,
  users,
} from "@/db/schema";
import type { MemberStanding, Standings } from "./standings";

export type EntryAudit = {
  entryId: string;
  value: number;
  status: "pending" | "approved" | "rejected";
  source: "self" | "coach" | "admin" | "import";
  recordedAt: Date;
  recordedByName: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  note: string | null;
};

export type SeasonMetricRow = {
  metricId: string;
  key: string;
  name: string;
  type: "percentage" | "integer" | "decimal" | "boolean" | "manual_score";
  target: number | null;
  weight: number;
  entry: EntryAudit | null;
};

export type AttendanceRow = {
  meetingId: string;
  meetsOn: string;
  startsAt: Date;
  lateAfterMinutes: number;
  meetingStatus: "scheduled" | "held" | "cancelled";
  /** Derived at render time, never stored. */
  isLate: boolean;
  entry: EntryAudit | null;
};

export type MemberDetail = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  initials: string;
  position: string | null;
  seasonRole: "member" | "coach";
  active: boolean;
  teamId: string;
  teamName: string;
  teamColor: string;
  /** Null for coaches, who are not scored. */
  standing: MemberStanding | null;
  seasonMetrics: SeasonMetricRow[];
  attendance: AttendanceRow[];
};

/**
 * Everything the per-member detail page shows: current value per metric, the
 * full session-by-session attendance record, and the audit trail behind each —
 * who recorded it, who decided it, and whether it came from a self check-in, a
 * coach, an admin or an import.
 *
 * Those fields have existed on `metric_entries` since Build 1 and have had
 * nowhere to surface until now.
 */
export async function getMemberDetail(
  db: Database,
  standings: Standings,
  membershipId: string,
): Promise<MemberDetail | null> {
  const recorder = aliasedTable(users, "recorder");
  const decider = aliasedTable(users, "decider");

  const [membership] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      position: memberships.position,
      active: memberships.active,
      seasonId: memberships.seasonId,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!membership || membership.seasonId !== standings.season.id) return null;

  const [metricRows, meetingRows, entryRows] = await Promise.all([
    db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.seasonId, membership.seasonId),
          eq(metrics.active, true),
        ),
      )
      .orderBy(asc(metrics.sortOrder)),
    db
      .select()
      .from(meetings)
      .where(eq(meetings.seasonId, membership.seasonId))
      .orderBy(asc(meetings.meetsOn)),
    db
      .select({
        id: metricEntries.id,
        metricId: metricEntries.metricId,
        meetingId: metricEntries.meetingId,
        value: metricEntries.value,
        status: metricEntries.status,
        source: metricEntries.source,
        recordedAt: metricEntries.recordedAt,
        decidedAt: metricEntries.decidedAt,
        note: metricEntries.note,
        recordedByName: recorder.name,
        decidedByName: decider.name,
      })
      .from(metricEntries)
      .leftJoin(recorder, eq(recorder.id, metricEntries.recordedBy))
      .leftJoin(decider, eq(decider.id, metricEntries.decidedBy))
      .where(eq(metricEntries.membershipId, membershipId)),
  ]);

  const toAudit = (row: (typeof entryRows)[number]): EntryAudit => ({
    entryId: row.id,
    value: row.value,
    status: row.status,
    source: row.source,
    recordedAt: row.recordedAt,
    recordedByName: row.recordedByName,
    decidedAt: row.decidedAt,
    decidedByName: row.decidedByName,
    note: row.note,
  });

  const attendanceMetric = metricRows.find((m) => m.key === "attendance");

  const seasonMetrics: SeasonMetricRow[] = metricRows
    .filter((m) => m.key !== "attendance")
    .map((metric) => {
      const entry = entryRows.find(
        (e) => e.metricId === metric.id && e.meetingId === null,
      );
      return {
        metricId: metric.id,
        key: metric.key,
        name: metric.name,
        type: metric.type,
        target: metric.target,
        weight: metric.weight,
        entry: entry ? toAudit(entry) : null,
      };
    });

  const attendance: AttendanceRow[] = attendanceMetric
    ? meetingRows.map((meeting) => {
        const entry = entryRows.find(
          (e) =>
            e.metricId === attendanceMetric.id && e.meetingId === meeting.id,
        );
        const isLate = Boolean(
          entry &&
            entry.value > 0 &&
            entry.recordedAt.getTime() >
              meeting.startsAt.getTime() + meeting.lateAfterMinutes * 60_000,
        );
        return {
          meetingId: meeting.id,
          meetsOn: meeting.meetsOn,
          startsAt: meeting.startsAt,
          lateAfterMinutes: meeting.lateAfterMinutes,
          meetingStatus: meeting.status,
          isLate,
          entry: entry ? toAudit(entry) : null,
        };
      })
    : [];

  const name = membership.name ?? membership.email ?? "Unknown";

  return {
    membershipId: membership.id,
    userId: membership.userId,
    name,
    email: membership.email ?? "",
    initials: name.slice(0, 2).toUpperCase(),
    position: membership.position,
    seasonRole: membership.role,
    active: membership.active,
    teamId: membership.teamId,
    teamName: membership.teamName,
    teamColor: membership.teamColor,
    standing:
      standings.members.find((m) => m.membershipId === membershipId) ?? null,
    seasonMetrics,
    attendance: attendance.reverse(),
  };
}
