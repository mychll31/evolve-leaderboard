/**
 * Weekly MVP selection. Pure — the rollup supplies scored members and reads
 * back the winners.
 */

export type AwardCandidate = {
  membershipId: string;
  name: string;
  score: number;
  /** Rank movement since last week; positive means climbed. */
  delta: number;
  /** Normalised 0-100 value per metric key. */
  metrics: Record<string, number>;
  /** False when the member has no prior snapshot to improve against. */
  hasPreviousRank: boolean;
};

export type WeeklyAward = {
  category: string;
  membershipId: string;
  value: number;
};

/**
 * Picks the winner for one numeric dimension.
 *
 * Ties break on name so a re-run settles on the same member rather than
 * flickering between them — the rollup is meant to be idempotent.
 */
function best(
  candidates: AwardCandidate[],
  valueOf: (c: AwardCandidate) => number,
): AwardCandidate | null {
  let winner: AwardCandidate | null = null;
  let bestValue = -Infinity;

  for (const candidate of candidates) {
    const value = valueOf(candidate);
    if (
      value > bestValue ||
      (value === bestValue && winner !== null && candidate.name < winner.name)
    ) {
      bestValue = value;
      winner = candidate;
    }
  }
  return winner;
}

/**
 * The week's automatic awards: overall, best in each metric, and most
 * improved.
 *
 * Most improved is only awarded when someone actually climbed *and* had a
 * previous rank to climb from — in week one nobody has moved, and handing the
 * award to whoever happens to sort first would be meaningless.
 */
export function selectWeeklyAwards(
  candidates: AwardCandidate[],
  metricKeys: string[],
): WeeklyAward[] {
  if (candidates.length === 0) return [];

  const awards: WeeklyAward[] = [];

  const overall = best(candidates, (c) => c.score);
  if (overall) {
    awards.push({
      category: "overall",
      membershipId: overall.membershipId,
      value: overall.score,
    });
  }

  for (const key of metricKeys) {
    const winner = best(candidates, (c) => c.metrics[key] ?? 0);
    if (winner) {
      awards.push({
        category: `metric:${key}`,
        membershipId: winner.membershipId,
        value: winner.metrics[key] ?? 0,
      });
    }
  }

  const improvable = candidates.filter((c) => c.hasPreviousRank && c.delta > 0);
  const improved = best(improvable, (c) => c.delta);
  if (improved) {
    awards.push({
      category: "most_improved",
      membershipId: improved.membershipId,
      value: improved.delta,
    });
  }

  return awards;
}

export function describeAwardCategory(
  category: string,
  metricNames: Record<string, string> = {},
): string {
  if (category === "overall") return "Most Valuable Player";
  if (category === "most_improved") return "Most Improved";
  if (category === "coach_choice") return "Coach's Choice";
  if (category.startsWith("metric:")) {
    const key = category.slice("metric:".length);
    return `Best ${metricNames[key] ?? key}`;
  }
  return category;
}
