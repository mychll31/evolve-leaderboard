import type { Entry, Meeting } from "../types";

/**
 * Consecutive held meetings attended, counting backwards from the most recent
 * one.
 *
 * Four rules that are easy to get wrong:
 *  - a *missing* entry for a held meeting breaks the streak, exactly like an
 *    absence — otherwise never checking in would preserve a streak forever;
 *  - only `approved` entries count toward the number, so an unapproved
 *    check-in cannot inflate it;
 *  - but a *pending* entry is skipped rather than treated as a break. Pending
 *    means the coach has not decided yet, and a member should not lose a
 *    thirty-session streak because approval is a few hours late. It starts
 *    counting again the moment it is approved, or breaks if rejected;
 *  - cancelled and not-yet-held meetings are skipped, not treated as breaks.
 *
 * `entries` should be the member's entries for the attendance metric.
 */
export function currentStreak(meetings: Meeting[], entries: Entry[]): number {
  const held = meetings
    .filter((m) => m.status === "held")
    .sort((a, b) => b.meetsOn.localeCompare(a.meetsOn));

  const attended = new Set<string>();
  const undecided = new Set<string>();
  for (const entry of entries) {
    if (!entry.meetingId) continue;
    if (entry.status === "approved" && entry.value > 0) {
      attended.add(entry.meetingId);
    } else if (entry.status === "pending") {
      undecided.add(entry.meetingId);
    }
  }

  let streak = 0;
  for (const meeting of held) {
    if (undecided.has(meeting.id)) continue;
    if (!attended.has(meeting.id)) break;
    streak++;
  }
  return streak;
}
