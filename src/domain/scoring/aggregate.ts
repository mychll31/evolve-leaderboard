import type { Entry, Metric } from "../types";

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Folds a member's entries for one metric into a single raw figure, expressed
 * in that metric's own units (a percentage, a count, a 1-10 score).
 *
 * Only `approved` entries count. Pending and rejected entries are invisible to
 * scoring, which is what stops an unapproved check-in from moving the
 * leaderboard.
 *
 * `entries` is assumed to be ordered oldest-first; `boolean` and
 * `manual_score` metrics read the most recent value.
 */
export function aggregate(
  metric: Metric,
  entries: Entry[],
  eligibleMeetings: number,
): number {
  const approved = entries.filter(
    (e) => e.metricId === metric.id && e.status === "approved",
  );

  switch (metric.type) {
    case "percentage": {
      // Percentage metrics are session-bound: the denominator is the number of
      // meetings actually held, NOT the number of entries recorded. That is
      // what makes a missing entry count against the member rather than
      // silently shrinking the denominator.
      if (eligibleMeetings > 0) {
        const present = approved.reduce((sum, e) => sum + e.value, 0);
        return (present / eligibleMeetings) * 100;
      }
      // No calendar yet — fall back to the mean of whatever was recorded.
      return mean(approved.map((e) => e.value));
    }
    case "integer":
      return approved.reduce((sum, e) => sum + e.value, 0);
    case "decimal":
      return mean(approved.map((e) => e.value));
    case "boolean":
      return approved.length > 0 && approved[approved.length - 1].value ? 1 : 0;
    case "manual_score":
      return approved.length > 0 ? approved[approved.length - 1].value : 0;
  }
}
