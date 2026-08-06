import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { meetings, memberships, metricEntries, metrics } from "@/db/schema";
import {
  AuthorizationError,
  assertCanManageMembership,
  type Actor,
} from "@/lib/auth/scoping";
import { NotFoundError } from "./guards";

/**
 * Attendance writes, kept free of `next/*` imports so they can be tested
 * directly against a database. The Server Actions in
 * `src/app/actions/attendance.ts` are thin wrappers that resolve the session
 * and revalidate paths.
 *
 * Every function here takes an explicit `Actor` and authorises before writing.
 */

async function attendanceMetricId(
  db: Database,
  seasonId: string,
): Promise<string> {
  const [metric] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(and(eq(metrics.seasonId, seasonId), eq(metrics.key, "attendance")))
    .limit(1);
  if (!metric) throw new Error("This season has no attendance metric");
  return metric.id;
}

async function requireOpenMeeting(db: Database, meetingId: string) {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);
  if (!meeting) throw new Error("Meeting not found");
  if (meeting.status === "cancelled") {
    throw new Error("That session was cancelled");
  }
  return meeting;
}

/**
 * A member checking themselves in. Counts immediately — there is no approval
 * step.
 *
 * A coach can still override afterwards via `recordForMember`, and that
 * override wins: a self check-in never overwrites a decision a coach has
 * already made, which is what keeps "marked missing" from being undone by
 * tapping the button again.
 *
 * Upserts rather than inserts, so tapping twice corrects the record instead of
 * failing on the unique index.
 */
export async function checkIn(
  db: Database,
  actor: Actor,
  membershipId: string,
  meetingId: string,
  now: Date = new Date(),
): Promise<void> {
  // Self check-in means *self*. Without this the membership id is attacker
  // controlled, and any signed-in member could mark another person present.
  // A coach recording for someone else goes through `recordForMember`, which
  // authorises against their team and tags the entry as coach-sourced.
  const [membership] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership) throw new NotFoundError("Membership");
  if (membership.userId !== actor.id) {
    throw new AuthorizationError("You can only check yourself in");
  }

  const meeting = await requireOpenMeeting(db, meetingId);
  const metricId = await attendanceMetricId(db, meeting.seasonId);

  const [existing] = await db
    .select({
      id: metricEntries.id,
      source: metricEntries.source,
    })
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.membershipId, membershipId),
        eq(metricEntries.metricId, metricId),
        eq(metricEntries.meetingId, meetingId),
      ),
    )
    .limit(1);

  if (existing) {
    // A coach or admin has already ruled on this session. Their decision
    // stands — otherwise "marked missing" could be undone by tapping again.
    if (existing.source !== "self") return;
    await db
      .update(metricEntries)
      .set({ value: 1, status: "approved", recordedAt: now, decidedAt: now })
      .where(eq(metricEntries.id, existing.id));
    return;
  }

  await db.insert(metricEntries).values({
    seasonId: meeting.seasonId,
    metricId,
    membershipId,
    meetingId,
    value: 1,
    status: "approved",
    source: "self",
    recordedBy: actor.id,
    recordedAt: now,
    // Self-decided: the member's own tap is the decision.
    decidedBy: actor.id,
    decidedAt: now,
  });
}

/** Coach or admin approving or rejecting a pending check-in. */
export async function decideEntry(
  db: Database,
  actor: Actor,
  entryId: string,
  decision: "approved" | "rejected",
  now: Date = new Date(),
): Promise<void> {
  const [entry] = await db
    .select()
    .from(metricEntries)
    .where(eq(metricEntries.id, entryId))
    .limit(1);
  if (!entry) throw new Error("Entry not found");

  await assertCanManageMembership(db, actor, entry.membershipId);

  await db
    .update(metricEntries)
    .set({
      status: decision,
      // Rejecting means "not present", so the value must move too — leaving it
      // at 1 would let a rejected entry still read as attendance elsewhere.
      value: decision === "approved" ? entry.value : 0,
      decidedBy: actor.id,
      decidedAt: now,
    })
    .where(eq(metricEntries.id, entryId));
}

/**
 * Coach recording on a member's behalf — the "both" path. Writes an approved
 * entry directly, tagged `source: 'coach'` so it stays distinguishable from a
 * genuine self check-in.
 */
export async function recordForMember(
  db: Database,
  actor: Actor,
  membershipId: string,
  meetingId: string,
  present: boolean,
  now: Date = new Date(),
): Promise<void> {
  await assertCanManageMembership(db, actor, membershipId);

  const meeting = await requireOpenMeeting(db, meetingId);
  const metricId = await attendanceMetricId(db, meeting.seasonId);

  const [existing] = await db
    .select({ id: metricEntries.id })
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.membershipId, membershipId),
        eq(metricEntries.metricId, metricId),
        eq(metricEntries.meetingId, meetingId),
      ),
    )
    .limit(1);

  const source = actor.role === "super_admin" ? "admin" : "coach";

  if (existing) {
    await db
      .update(metricEntries)
      .set({
        value: present ? 1 : 0,
        status: "approved",
        source,
        decidedBy: actor.id,
        decidedAt: now,
      })
      .where(eq(metricEntries.id, existing.id));
    return;
  }

  await db.insert(metricEntries).values({
    seasonId: meeting.seasonId,
    metricId,
    membershipId,
    meetingId,
    value: present ? 1 : 0,
    status: "approved",
    source,
    recordedBy: actor.id,
    recordedAt: now,
    decidedBy: actor.id,
    decidedAt: now,
  });
}

/** Approves every pending entry for one meeting on one team. */
export async function approveAllPending(
  db: Database,
  actor: Actor,
  meetingId: string,
  membershipIds: string[],
  now: Date = new Date(),
): Promise<number> {
  if (membershipIds.length === 0) return 0;

  // Authorise every target before writing anything, so a partially-permitted
  // batch fails outright rather than half-applying.
  for (const membershipId of membershipIds) {
    await assertCanManageMembership(db, actor, membershipId);
  }

  const pending = await db
    .select({ id: metricEntries.id, membershipId: metricEntries.membershipId })
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.meetingId, meetingId),
        eq(metricEntries.status, "pending"),
      ),
    );

  const targets = pending.filter((p) => membershipIds.includes(p.membershipId));
  for (const entry of targets) {
    await db
      .update(metricEntries)
      .set({ status: "approved", decidedBy: actor.id, decidedAt: now })
      .where(eq(metricEntries.id, entry.id));
  }
  return targets.length;
}
