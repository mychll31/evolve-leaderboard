import { and, asc, eq, gte } from "drizzle-orm";
import type { Database } from "@/db/client";
import { meetings, metricEntries, metrics } from "@/db/schema";
import { isoToday } from "./standings";

export type CheckInState =
  | "no_session"
  | "open"
  | "pending"
  | "present"
  | "missing";

export type CheckInView = {
  state: CheckInState;
  meetingId: string | null;
  meetsOn: string | null;
  startsAt: Date | null;
  /** Derived: they checked in after the grace window. */
  isLate: boolean;
  recordedAt: Date | null;
  /** Next scheduled session, shown when there is nothing on today. */
  nextMeetsOn: string | null;
};

const EMPTY: CheckInView = {
  state: "no_session",
  meetingId: null,
  meetsOn: null,
  startsAt: null,
  isLate: false,
  recordedAt: null,
  nextMeetsOn: null,
};

/**
 * What the signed-in member can do about attendance right now.
 *
 * Scoped to *today's* session only. Letting someone check in for a past
 * session would make attendance self-certifying after the fact, which is the
 * one thing the approval flow exists to prevent — a coach can still record a
 * missed day on their behalf from the Coach Desk.
 */
export async function getCheckIn(
  db: Database,
  seasonId: string,
  membershipId: string | null,
  now: Date = new Date(),
): Promise<CheckInView> {
  if (!membershipId) return EMPTY;

  const today = isoToday(now);

  const [todaysMeeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.seasonId, seasonId), eq(meetings.meetsOn, today)))
    .limit(1);

  if (!todaysMeeting || todaysMeeting.status === "cancelled") {
    const [next] = await db
      .select({ meetsOn: meetings.meetsOn })
      .from(meetings)
      .where(
        and(
          eq(meetings.seasonId, seasonId),
          eq(meetings.status, "scheduled"),
          gte(meetings.meetsOn, today),
        ),
      )
      .orderBy(asc(meetings.meetsOn))
      .limit(1);
    return { ...EMPTY, nextMeetsOn: next?.meetsOn ?? null };
  }

  const [attendance] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(and(eq(metrics.seasonId, seasonId), eq(metrics.key, "attendance")))
    .limit(1);
  if (!attendance) return EMPTY;

  const [entry] = await db
    .select()
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.membershipId, membershipId),
        eq(metricEntries.metricId, attendance.id),
        eq(metricEntries.meetingId, todaysMeeting.id),
      ),
    )
    .limit(1);

  const base = {
    meetingId: todaysMeeting.id,
    meetsOn: todaysMeeting.meetsOn,
    startsAt: todaysMeeting.startsAt,
    nextMeetsOn: null,
  };

  if (!entry) return { ...base, state: "open", isLate: false, recordedAt: null };

  const isLate =
    entry.value > 0 &&
    entry.recordedAt.getTime() >
      todaysMeeting.startsAt.getTime() + todaysMeeting.lateAfterMinutes * 60_000;

  const state: CheckInState =
    entry.status === "pending"
      ? "pending"
      : entry.status === "approved" && entry.value > 0
        ? "present"
        : "missing";

  return { ...base, state, isLate, recordedAt: entry.recordedAt };
}
