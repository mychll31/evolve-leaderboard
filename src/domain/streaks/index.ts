import type { Entry, Meeting } from "../types";

/**
 * Consecutive held meetings attended, counting backwards from the most recent
 * one.
 *
 * Three rules that are easy to get wrong:
 *  - a *missing* entry for a held meeting breaks the streak, exactly like an
 *    absence — otherwise never checking in would preserve a streak forever;
 *  - only `approved` entries count, so an unapproved check-in cannot inflate
 *    the number;
 *  - cancelled and not-yet-held meetings are skipped, not treated as breaks.
 *
 * `entries` should be the member's entries for the attendance metric.
 */
export function currentStreak(meetings: Meeting[], entries: Entry[]): number {
  const held = meetings
    .filter((m) => m.status === "held")
    .sort((a, b) => b.meetsOn.localeCompare(a.meetsOn));

  const attended = new Set(
    entries
      .filter((e) => e.status === "approved" && e.value > 0 && e.meetingId)
      .map((e) => e.meetingId as string),
  );

  let streak = 0;
  for (const meeting of held) {
    if (!attended.has(meeting.id)) break;
    streak++;
  }
  return streak;
}
