import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { meetings, metricEntries, seasons } from "@/db/schema";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

export type MeetingStatus = "scheduled" | "held" | "cancelled";

export type RecurrenceInput = {
  /** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay`. */
  weekdays: number[];
  /** `HH:MM`, interpreted as UTC. */
  startTime: string;
  lateAfterMinutes: number;
  /** Defaults to the season's own range. */
  from?: string;
  to?: string;
};

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function startsAtFor(meetsOn: string, startTime: string): Date {
  return new Date(`${meetsOn}T${startTime}:00.000Z`);
}

/**
 * Bulk-creates the season's sessions from a recurrence rule.
 *
 * Existing dates are skipped rather than overwritten, so an admin can extend a
 * calendar or add a weekday mid-season without destroying attendance already
 * recorded against the sessions that overlap.
 */
export async function generateMeetings(
  db: Database,
  actor: Actor,
  seasonId: string,
  input: RecurrenceInput,
): Promise<{ created: number; skipped: number }> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);

  if (input.weekdays.length === 0) {
    throw new ConflictError("Pick at least one weekday");
  }
  if (input.weekdays.some((d) => d < 0 || d > 6)) {
    throw new ConflictError("Weekdays must be between 0 and 6");
  }
  if (!TIME.test(input.startTime)) {
    throw new ConflictError("Start time must be in HH:MM format");
  }
  if (input.lateAfterMinutes < 0) {
    throw new ConflictError("Grace period cannot be negative");
  }

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) throw new NotFoundError("Season");

  const from = input.from ?? season.startsOn;
  const to = input.to ?? season.endsOn;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new ConflictError("Dates must be in YYYY-MM-DD format");
  }
  if (to < from) throw new ConflictError("End date must not precede the start");

  const existing = await db
    .select({ meetsOn: meetings.meetsOn })
    .from(meetings)
    .where(eq(meetings.seasonId, seasonId));
  const taken = new Set(existing.map((m) => m.meetsOn));

  const wanted = new Set(input.weekdays);
  const values: (typeof meetings.$inferInsert)[] = [];
  let skipped = 0;

  for (
    let time = Date.parse(`${from}T00:00:00Z`);
    time <= Date.parse(`${to}T00:00:00Z`);
    time += DAY_MS
  ) {
    const date = new Date(time);
    if (!wanted.has(date.getUTCDay())) continue;

    const meetsOn = date.toISOString().slice(0, 10);
    if (taken.has(meetsOn)) {
      skipped++;
      continue;
    }

    values.push({
      seasonId,
      meetsOn,
      startsAt: startsAtFor(meetsOn, input.startTime),
      lateAfterMinutes: input.lateAfterMinutes,
      status: "scheduled",
    });
  }

  for (let i = 0; i < values.length; i += 200) {
    await db.insert(meetings).values(values.slice(i, i + 200));
  }

  return { created: values.length, skipped };
}

export async function createMeeting(
  db: Database,
  actor: Actor,
  seasonId: string,
  input: {
    meetsOn: string;
    startTime: string;
    lateAfterMinutes: number;
    label?: string | null;
  },
): Promise<string> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);

  if (!ISO_DATE.test(input.meetsOn)) {
    throw new ConflictError("Date must be in YYYY-MM-DD format");
  }
  if (!TIME.test(input.startTime)) {
    throw new ConflictError("Start time must be in HH:MM format");
  }

  const [season] = await db
    .select({ startsOn: seasons.startsOn, endsOn: seasons.endsOn })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) throw new NotFoundError("Season");
  if (input.meetsOn < season.startsOn || input.meetsOn > season.endsOn) {
    throw new ConflictError(
      `Sessions must fall inside the season (${season.startsOn} to ${season.endsOn})`,
    );
  }

  const [clash] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(eq(meetings.seasonId, seasonId), eq(meetings.meetsOn, input.meetsOn)),
    )
    .limit(1);
  if (clash) {
    throw new ConflictError(`There is already a session on ${input.meetsOn}`);
  }

  const [row] = await db
    .insert(meetings)
    .values({
      seasonId,
      meetsOn: input.meetsOn,
      startsAt: startsAtFor(input.meetsOn, input.startTime),
      lateAfterMinutes: input.lateAfterMinutes,
      label: input.label ?? null,
      status: "scheduled",
    })
    .returning({ id: meetings.id });

  return row.id;
}

export async function updateMeeting(
  db: Database,
  actor: Actor,
  meetingId: string,
  input: {
    startTime?: string;
    lateAfterMinutes?: number;
    label?: string | null;
    status?: MeetingStatus;
  },
): Promise<void> {
  assertAdmin(actor);

  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);
  if (!meeting) throw new NotFoundError("Session");
  await assertSeasonWritable(db, meeting.seasonId);

  if (input.startTime !== undefined && !TIME.test(input.startTime)) {
    throw new ConflictError("Start time must be in HH:MM format");
  }

  await db
    .update(meetings)
    .set({
      ...(input.startTime !== undefined
        ? { startsAt: startsAtFor(meeting.meetsOn, input.startTime) }
        : {}),
      ...(input.lateAfterMinutes !== undefined
        ? { lateAfterMinutes: input.lateAfterMinutes }
        : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .where(eq(meetings.id, meetingId));
}

/**
 * Removes a session outright. Refused once attendance exists — cancelling is
 * the non-destructive option, and it already excludes the session from
 * scoring and streaks.
 */
export async function deleteMeeting(
  db: Database,
  actor: Actor,
  meetingId: string,
): Promise<void> {
  assertAdmin(actor);

  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);
  if (!meeting) throw new NotFoundError("Session");
  await assertSeasonWritable(db, meeting.seasonId);

  const [entry] = await db
    .select({ id: metricEntries.id })
    .from(metricEntries)
    .where(eq(metricEntries.meetingId, meetingId))
    .limit(1);
  if (entry) {
    throw new ConflictError(
      "This session already has attendance recorded. Cancel it instead of deleting it.",
    );
  }

  await db.delete(meetings).where(eq(meetings.id, meetingId));
}

/** Marks every scheduled session on or before a date as held. */
export async function markHeldThrough(
  db: Database,
  actor: Actor,
  seasonId: string,
  through: string,
): Promise<number> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);

  const candidates = await db
    .select({ id: meetings.id, meetsOn: meetings.meetsOn })
    .from(meetings)
    .where(
      and(eq(meetings.seasonId, seasonId), eq(meetings.status, "scheduled")),
    );

  const ids = candidates.filter((m) => m.meetsOn <= through).map((m) => m.id);
  if (ids.length === 0) return 0;

  await db
    .update(meetings)
    .set({ status: "held" })
    .where(inArray(meetings.id, ids));

  return ids.length;
}
