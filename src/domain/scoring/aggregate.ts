import type { Entry, Metric } from "../types";

/**
 * Folds a member's entries for one metric into one raw 0-100 value.
 *
 * Only `approved` entries count. Pending and rejected entries are invisible to
 * scoring, which is what stops an unapproved check-in from moving the
 * leaderboard.
 *
 * The current product has no calendar scoring: every metric is season-level,
 * and the most recent approved value wins. Older calendar-bound rows are only
 * used as a backward-compatible fallback if no season-level value exists.
 */
export function aggregate(
  metric: Metric,
  entries: Entry[],
  _eligibleMeetings = 0,
): number {
  const approved = entries.filter(
    (e) => e.metricId === metric.id && e.status === "approved",
  );
  if (approved.length === 0) return 0;

  const seasonLevel = approved.filter((e) => e.meetingId === null);
  if (seasonLevel.length > 0) {
    return seasonLevel[seasonLevel.length - 1].value;
  }

  const total = approved.reduce((sum, entry) => sum + entry.value, 0);
  return total / approved.length;
}
