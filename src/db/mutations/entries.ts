import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { meetings, memberships, metricEntries, metrics } from "@/db/schema";
import { assertCanManageMembership, type Actor } from "@/lib/auth/scoping";
import { ConflictError, NotFoundError, assertSeasonWritable } from "./guards";

/**
 * Generic metric-entry writes, backing the per-member detail page.
 *
 * Attendance has its own module because it carries the pending/approve
 * workflow; everything else — assignment counts, quiz scores, manual
 * ratings — is recorded directly by a coach or admin and lands approved.
 */

export type SetEntryInput = {
  membershipId: string;
  metricId: string;
  /** Null for season-level metrics; set for per-session ones. */
  meetingId?: string | null;
  value: number;
  note?: string | null;
};

export async function setEntryValue(
  db: Database,
  actor: Actor,
  input: SetEntryInput,
  now: Date = new Date(),
): Promise<string> {
  await assertCanManageMembership(db, actor, input.membershipId);

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, input.membershipId))
    .limit(1);
  if (!membership) throw new NotFoundError("Membership");
  await assertSeasonWritable(db, membership.seasonId);

  const [metric] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.id, input.metricId))
    .limit(1);
  if (!metric) throw new NotFoundError("Metric");
  if (metric.seasonId !== membership.seasonId) {
    throw new ConflictError("That metric belongs to a different season");
  }

  if (!Number.isFinite(input.value)) {
    throw new ConflictError("Value must be a number");
  }
  if (input.value < 0) {
    throw new ConflictError("Value cannot be negative");
  }
  if (metric.type === "boolean" && input.value !== 0 && input.value !== 1) {
    throw new ConflictError("A yes/no metric accepts only 0 or 1");
  }
  if (metric.type === "manual_score" && input.value > 10) {
    throw new ConflictError("A manual score runs from 0 to 10");
  }

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

  const [existing] = await db
    .select({ id: metricEntries.id })
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.membershipId, input.membershipId),
        eq(metricEntries.metricId, input.metricId),
        meetingId
          ? eq(metricEntries.meetingId, meetingId)
          : isNull(metricEntries.meetingId),
      ),
    )
    .limit(1);

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
