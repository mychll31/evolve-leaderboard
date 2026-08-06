import type { RankableMember, RankedMember } from "../types";

/** Scores are floats from division; treat differences below this as a tie. */
const EPSILON = 1e-9;

/**
 * Competition ranking: tied members share a rank and the next rank is skipped
 * (1, 2, 2, 4). The prototype used `index + 1`, which silently gave equal
 * scores different ranks.
 *
 * Attendance then name order tied members within their shared rank, so the
 * list is stable across renders without inventing a difference between them.
 */
export function rankMembers(rows: RankableMember[]): RankedMember[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      b.attendance - a.attendance ||
      a.name.localeCompare(b.name),
  );

  const ranked: RankedMember[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const previous = ranked[i - 1];
    const tied =
      previous !== undefined &&
      Math.abs(sorted[i].score - sorted[i - 1].score) < EPSILON;
    ranked.push({ ...sorted[i], rank: tied ? previous.rank : i + 1 });
  }
  return ranked;
}
