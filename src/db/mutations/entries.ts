import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { meetings, memberships, metricEntries, metrics } from "@/db/schema";
import {
  AuthorizationError,
  assertCanManageMembership,
  type Actor,
} from "@/lib/auth/scoping";
import { ConflictError, NotFoundError, assertSeasonWritable } from "./guards";

/**
 * Generic metric-entry writes, backing the per-member detail page and the
 * member's own score log on /me.
 */

export type SetEntryInput = {
  membershipId: string;
  metricId: string;
  /** Kept for compatibility with older calendar entries. New writes are null. */
  meetingId?: string | null;
  value: number;
  note?: string | null;
};

export type LogOwnEntryInput = {
  membershipId: string;
  metricId: string;
  /** Done or not done — a member logs a fact, not a grade. */
  logged: boolean;
};

/**
 * What a member's log is worth.
 *
 * Members log a metric as done or not done, but scoring averages every metric
 * on the shared 0-100 scale, so "done" has to be a full 100 — otherwise three
 * of three logged would average to 1%, not the 100% the member is promised.
 */
const LOGGED = 100;
const NOT_LOGGED = 0;

/** Every metric is recorded on the same 0-100 scale, so one rule covers all. */
function assertValueInRange(value: number): void {
  if (!Number.isFinite(value)) {
    throw new ConflictError("Value must be a number");
  }
  if (value < 0) {
    throw new ConflictError("Value cannot be negative");
  }
  if (value > 100) {
    throw new ConflictError("Value cannot be greater than 100");
  }
}

/**
 * Loads the two rows a write targets and rejects the pairings that must never
 * be written: a locked season, or a metric from a different season than the
 * membership being scored.
 */
async function resolveTarget(
  db: Database,
  membershipId: string,
  metricId: string,
) {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership) throw new NotFoundError("Membership");
  await assertSeasonWritable(db, membership.seasonId);

  const [metric] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.id, metricId))
    .limit(1);
  if (!metric) throw new NotFoundError("Metric");
  if (metric.seasonId !== membership.seasonId) {
    throw new ConflictError("That metric belongs to a different season");
  }

  return { membership, metric };
}

/** The existing row for this member/metric/session, if there is one. */
async function findEntry(
  db: Database,
  membershipId: string,
  metricId: string,
  meetingId: string | null,
) {
  const [row] = await db
    .select({ id: metricEntries.id, source: metricEntries.source })
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.membershipId, membershipId),
        eq(metricEntries.metricId, metricId),
        meetingId
          ? eq(metricEntries.meetingId, meetingId)
          : isNull(metricEntries.meetingId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function setEntryValue(
  db: Database,
  actor: Actor,
  input: SetEntryInput,
  now: Date = new Date(),
): Promise<string> {
  await assertCanManageMembership(db, actor, input.membershipId);

  const { membership } = await resolveTarget(
    db,
    input.membershipId,
    input.metricId,
  );

  assertValueInRange(input.value);

  const meetingId = input.meetingId ?? null;
  if (meetingId) {
    const [meeting] = await db
      .select({ id: meetings.id, seasonId: meetings.seasonId })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    if (!meeting) throw new NotFoundError("Session");
    if (meeting.seasonId !== membership.seasonId) {
      throw new ConflictError("That session belongs to a different season");
    }
  }

  const source = actor.role === "super_admin" ? "admin" : "coach";

  const existing = await findEntry(
    db,
    input.membershipId,
    input.metricId,
    meetingId,
  );

  if (existing) {
    await db
      .update(metricEntries)
      .set({
        value: input.value,
        status: "approved",
        source,
        decidedBy: actor.id,
        decidedAt: now,
        ...(input.note !== undefined ? { note: input.note } : {}),
      })
      .where(eq(metricEntries.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(metricEntries)
    .values({
      seasonId: membership.seasonId,
      metricId: input.metricId,
      membershipId: input.membershipId,
      meetingId,
      value: input.value,
      status: "approved",
      source,
      recordedBy: actor.id,
      recordedAt: now,
      decidedBy: actor.id,
      decidedAt: now,
      note: input.note ?? null,
    })
    .returning({ id: metricEntries.id });

  return row.id;
}

/**
 * A member logging a season metric as done, from /me.
 *
 * There is no number to enter: the member says they did it, and that metric is
 * worth its full share of the total. Two of three metrics logged is 66.7%.
 *
 * It counts immediately — there is no approval step, which is the same bargain
 * self check-ins already make. The row is tagged `source: 'self'` so a Leader
 * can always tell a self-reported log from a value they set.
 *
 * A value a Leader or admin has already recorded belongs to them: the member
 * cannot overwrite it, for the same reason a self check-in never undoes
 * "marked missing". Their own page renders those metrics as locked, so this
 * throw is a backstop against a stale page rather than something a member can
 * walk into.
 */
export async function logOwnEntry(
  db: Database,
  actor: Actor,
  input: LogOwnEntryInput,
  now: Date = new Date(),
): Promise<string> {
  // Self-logging means *self*. Without this the membership id is attacker
  // controlled, and any signed-in member could score another person. A Leader
  // recording for someone else goes through `setEntryValue`, which authorises
  // against their team and tags the entry as coach-sourced.
  const [owner] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.id, input.membershipId))
    .limit(1);
  if (!owner) throw new NotFoundError("Membership");
  if (owner.userId !== actor.id) {
    throw new AuthorizationError("You can only log your own scores");
  }

  const { membership, metric } = await resolveTarget(
    db,
    input.membershipId,
    input.metricId,
  );

  // Archived metrics are not shown to members and no longer count, so writing
  // to one can only be a stale page or a forged request.
  if (!metric.active) {
    throw new ConflictError("That metric is no longer being tracked");
  }

  const value = input.logged ? LOGGED : NOT_LOGGED;

  const existing = await findEntry(
    db,
    input.membershipId,
    input.metricId,
    null,
  );

  if (existing) {
    if (existing.source !== "self") {
      throw new ConflictError(
        `Your Leader recorded ${metric.name} — ask them to change it`,
      );
    }
    await db
      .update(metricEntries)
      .set({
        value,
        status: "approved",
        source: "self",
        recordedBy: actor.id,
        recordedAt: now,
        // Self-decided: the member's own entry is the decision.
        decidedBy: actor.id,
        decidedAt: now,
      })
      .where(eq(metricEntries.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(metricEntries)
    .values({
      seasonId: membership.seasonId,
      metricId: input.metricId,
      membershipId: input.membershipId,
      meetingId: null,
      value,
      status: "approved",
      source: "self",
      recordedBy: actor.id,
      recordedAt: now,
      decidedBy: actor.id,
      decidedAt: now,
    })
    .returning({ id: metricEntries.id });

  return row.id;
}

/** Removes a recorded value entirely, so the metric reads as unrecorded. */
export async function deleteEntry(
  db: Database,
  actor: Actor,
  entryId: string,
): Promise<void> {
  const [entry] = await db
    .select()
    .from(metricEntries)
    .where(eq(metricEntries.id, entryId))
    .limit(1);
  if (!entry) throw new NotFoundError("Entry");

  await assertCanManageMembership(db, actor, entry.membershipId);
  await assertSeasonWritable(db, entry.seasonId);

  await db.delete(metricEntries).where(eq(metricEntries.id, entryId));
}
