"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { updateStandings } from "@/db/queries/cached-standings";
import { logOwnEntry } from "@/db/mutations/entries";
import {
  ConflictError,
  NotFoundError,
  SeasonLockedError,
} from "@/db/mutations/guards";
import { requireUser } from "@/lib/auth/guards";
import { AuthorizationError } from "@/lib/auth/scoping";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The member marking one of their metrics done, or undoing it, from /me.
 *
 * A thin session wrapper: the authorisation is in `logOwnEntry`, which checks
 * the membership actually belongs to the caller rather than trusting the id
 * that arrives from the browser.
 */
export async function logOwnEntryAction(
  membershipId: string,
  metricId: string,
  logged: boolean,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    await logOwnEntry(getDb(), user, { membershipId, metricId, logged });
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof SeasonLockedError
    ) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Something went wrong" };
  }

  updateStandings();
  // A logged value counts immediately, so every screen that shows a score is
  // now stale — including the Leader Desk, which is where it gets corrected.
  for (const path of [
    "/me",
    "/dashboard",
    "/leaderboard",
    "/teams",
    "/coach",
    "/members",
  ]) {
    revalidatePath(path);
  }

  return { ok: true };
}
