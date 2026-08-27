import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, penalties } from "@/db/schema";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

/**
 * Minus points: an admin taking earned activity points off one person.
 *
 * Admin only, deliberately. A Leader can already record and unrecord their own
 * team's work through `setEntryValue`, which is a statement about what was
 * done; a deduction is a sanction, and letting a Leader dock a rival team's
 * member — or their own — is a different power than the one they were given.
 *
 * Each deduction is its own row rather than a running total per member, so the
 * reason and the issuer survive: "why am I down twelve points" has an answer,
 * and lifting one sanction does not disturb the others.
 */

export type PenaltyInput = {
  membershipId: string;
  /** Positive magnitude to take off. */
  points: number;
  reason?: string | null;
};

/**
 * Keep one deduction bounded to the value of one fully completed activity.
 * Admins can record separate deductions when distinct sanctions apply.
 */
const MAX_POINTS = 100;

function validate(input: PenaltyInput): void {
  if (!Number.isFinite(input.points)) {
    throw new ConflictError("Minus points must be a number");
  }
  if (input.points <= 0) {
    throw new ConflictError("Minus points must be greater than zero");
  }
  if (input.points > MAX_POINTS) {
    throw new ConflictError(
      `Minus points cannot be more than ${MAX_POINTS} at once`,
    );
  }
}

export async function addPenalty(
  db: Database,
  actor: Actor,
  input: PenaltyInput,
  now: Date = new Date(),
): Promise<string> {
  assertAdmin(actor);
  validate(input);

  const [membership] = await db
    .select({ id: memberships.id, seasonId: memberships.seasonId })
    .from(memberships)
    .where(eq(memberships.id, input.membershipId))
    .limit(1);
  if (!membership) throw new NotFoundError("Membership");

  // The season is resolved from the membership, never taken from the caller:
  // a deduction filed against the wrong season would be invisible on the board
  // it was meant for and would silently dock a different one.
  await assertSeasonWritable(db, membership.seasonId);

  const reason = input.reason?.trim();

  const [row] = await db
    .insert(penalties)
    .values({
      seasonId: membership.seasonId,
      membershipId: membership.id,
      points: input.points,
      reason: reason ? reason : null,
      issuedBy: actor.id,
      issuedAt: now,
    })
    .returning({ id: penalties.id });

  return row.id;
}

/** Lifts one deduction, restoring exactly the points it took. */
export async function deletePenalty(
  db: Database,
  actor: Actor,
  penaltyId: string,
): Promise<void> {
  assertAdmin(actor);

  const [row] = await db
    .select({ id: penalties.id, seasonId: penalties.seasonId })
    .from(penalties)
    .where(eq(penalties.id, penaltyId))
    .limit(1);
  if (!row) throw new NotFoundError("Minus points");

  await assertSeasonWritable(db, row.seasonId);

  await db.delete(penalties).where(eq(penalties.id, penaltyId));
}
