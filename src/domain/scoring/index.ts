import type { Entry, Formula, Metric, ScoreBreakdownPart } from "../types";
import { aggregate } from "./aggregate";
import { combine } from "./combine";
import { normalize } from "./normalize";

export { aggregate } from "./aggregate";
export { combine, type WeightedPart } from "./combine";
export { normalize } from "./normalize";

/**
 * Per-metric detail behind a member's score: the raw figure in the metric's
 * own units and the normalised 0-100 value that actually feeds the formula.
 *
 * This is what the member-facing score breakdown renders. If admins can
 * reweight the formula, members need to be able to see why their number moved.
 */
export function scoreBreakdown(
  metrics: Metric[],
  entries: Entry[],
  eligibleMeetings: number,
): ScoreBreakdownPart[] {
  return metrics.map((metric) => {
    const raw = aggregate(metric, entries, eligibleMeetings);
    return { metric, raw, value: normalize(metric, raw) };
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
  formula: Formula = "weighted",
): number {
  const parts = scoreBreakdown(metrics, entries, eligibleMeetings);
  return combine(
    parts.map((p) => ({ weight: p.metric.weight, value: p.value })),
    formula,
  );
}
