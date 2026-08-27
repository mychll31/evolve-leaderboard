import type { Entry, Metric, ScoreBreakdownPart } from "../types";
import { aggregate } from "./aggregate";
import { combine } from "./combine";
import { normalize } from "./normalize";

export { aggregate } from "./aggregate";
export { combine, type ScorePart } from "./combine";
export { normalize } from "./normalize";
export { applyPenalty, totalPenalty } from "./penalty";

/**
 * Per-metric detail behind a member's score.
 */
export function scoreBreakdown(
  metrics: Metric[],
  entries: Entry[],
  eligibleMeetings: number,
): ScoreBreakdownPart[] {
  return metrics.map((metric) => {
    const raw = aggregate(metric, entries, eligibleMeetings);
    return { metric, raw, value: normalize(raw) };
  });
}

/**
 * A member's final score. Returned at full precision — rounding is a display
 * concern, and rounding before ranking would manufacture ties.
 */
export function scoreMember(
  metrics: Metric[],
  entries: Entry[],
  eligibleMeetings: number,
): number {
  const parts = scoreBreakdown(metrics, entries, eligibleMeetings);
  return combine(parts.map((p) => ({ value: p.value })));
}
