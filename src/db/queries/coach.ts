import { and, eq, inArray } from "drizzle-orm";
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
import { isoToday } from "./standings";

export type AttendanceState = "pending" | "present" | "missing" | "unrecorded";

export type ApprovalRow = {
  entryId: string | null;
  membershipId: string;
  name: string;
  initials: string;
  state: AttendanceState;
  /** Derived, never stored: checked in after the grace window. */
  isLate: boolean;
  recordedAt: Date | null;
  source: "self" | "coach" | "admin" | "import" | null;
  note: string;
};

export type CoachDesk = {
  teamId: string;
  teamName: string;
  teamColor: string;
  meeting: {
    id: string;
    meetsOn: string;
    startsAt: Date;
    lateAfterMinutes: number;
    isToday: boolean;
  } | null;
  rows: ApprovalRow[];
  pendingCount: number;
  presentCount: number;
  missingCount: number;
  topPerformers: MemberStanding[];
  bottomPerformers: MemberStanding[];
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Everything the Coach Desk renders for one team, for the session that
 * currently needs attention: today's meeting if there is one, otherwise the
 * most recent held meeting.
 */
export async function getCoachDesk(
  db: Database,
  standings: Standings,
  teamId: string,
  now: Date = new Date(),
): Promise<CoachDesk | null> {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return null;

  const today = isoToday(now);
  const seasonMeetings = await db
    .select()
    .from(meetings)
    .where(eq(meetings.seasonId, standings.season.id));

  const target =
    seasonMeetings.find((m) => m.meetsOn === today) ??
    seasonMeetings
      .filter((m) => m.status === "held")
      .sort((a, b) => b.meetsOn.localeCompare(a.meetsOn))[0] ??
    null;

  const roster = await db
    .select({
      membershipId: memberships.id,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.teamId, teamId),
        eq(memberships.role, "member"),
        eq(memberships.active, true),
      ),
    );

  const [attendanceMetric] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(
      and(
        eq(metrics.seasonId, standings.season.id),
        eq(metrics.key, "attendance"),
      ),
    )
    .limit(1);

  const entries =
    target && attendanceMetric && roster.length > 0
      ? await db
          .select()
          .from(metricEntries)
          .where(
            and(
              eq(metricEntries.meetingId, target.id),
              eq(metricEntries.metricId, attendanceMetric.id),
              inArray(
                metricEntries.membershipId,
                roster.map((r) => r.membershipId),
              ),
            ),
          )
      : [];

  const entryByMembership = new Map(entries.map((e) => [e.membershipId, e]));

  const rows: ApprovalRow[] = roster
    .map((member) => {
      const entry = entryByMembership.get(member.membershipId);
      const name = member.name ?? member.email ?? "Unknown";

      if (!entry || !target) {
        return {
          entryId: null,
          membershipId: member.membershipId,
          name,
          initials: name.slice(0, 2).toUpperCase(),
          state: "unrecorded" as const,
          isLate: false,
          recordedAt: null,
          source: null,
          note: "No check-in recorded",
        };
      }

      const graceMs = target.lateAfterMinutes * 60_000;
      const isLate =
        entry.value > 0 &&
        entry.recordedAt.getTime() > target.startsAt.getTime() + graceMs;

      const state: AttendanceState =
        entry.status === "pending"
          ? "pending"
          : entry.status === "approved" && entry.value > 0
            ? "present"
            : "missing";

      const note =
        entry.value > 0
          ? `Checked in ${formatTime(entry.recordedAt)}${isLate ? " · late" : ""}`
          : "Marked absent";

      return {
        entryId: entry.id,
        membershipId: member.membershipId,
        name,
        initials: name.slice(0, 2).toUpperCase(),
        state,
        isLate,
        recordedAt: entry.recordedAt,
        source: entry.source,
        note,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamMembers = standings.members
    .filter((m) => m.teamId === teamId)
    .sort((a, b) => a.rank - b.rank);

  return {
    teamId,
    teamName: team.name,
    teamColor: team.color,
    meeting: target
      ? {
          id: target.id,
          meetsOn: target.meetsOn,
          startsAt: target.startsAt,
          lateAfterMinutes: target.lateAfterMinutes,
          isToday: target.meetsOn === today,
        }
      : null,
    rows,
    pendingCount: rows.filter((r) => r.state === "pending").length,
    presentCount: rows.filter((r) => r.state === "present").length,
    missingCount: rows.filter(
      (r) => r.state === "missing" || r.state === "unrecorded",
    ).length,
    topPerformers: teamMembers.slice(0, 3),
    bottomPerformers: teamMembers.slice(-3).reverse(),
  };
}
