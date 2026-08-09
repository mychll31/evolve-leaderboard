"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { updateStandings } from "@/db/queries/cached-standings";
import {
  approveAllPending,
  checkIn,
  decideEntry,
  recordForMember,
} from "@/db/mutations/attendance";
import { requireUser } from "@/lib/auth/guards";
import { AuthorizationError } from "@/lib/auth/scoping";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Thin session wrappers around `src/db/mutations/attendance`. The
 * authorisation itself lives in the mutation layer so it is exercised by tests
 * without faking a request — these only resolve who is asking and refresh the
 * affected pages.
 */
async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong",
    };
  }

  updateStandings();
  // Attendance moves scores, so the leaderboard and dashboard are stale too.
  for (const path of ["/coach", "/dashboard", "/leaderboard", "/teams", "/me"]) {
    revalidatePath(path);
  }
  return { ok: true };
}

export async function checkInAction(
  membershipId: string,
  meetingId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => checkIn(getDb(), user, membershipId, meetingId));
}

export async function decideEntryAction(
  entryId: string,
  decision: "approved" | "rejected",
): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => decideEntry(getDb(), user, entryId, decision));
}

export async function recordAttendanceAction(
  membershipId: string,
  meetingId: string,
  present: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  return run(() =>
    recordForMember(getDb(), user, membershipId, meetingId, present),
  );
}

export async function approveAllAction(
  meetingId: string,
  membershipIds: string[],
): Promise<ActionResult> {
  const user = await requireUser();
  return run(async () => {
    await approveAllPending(getDb(), user, meetingId, membershipIds);
  });
}
