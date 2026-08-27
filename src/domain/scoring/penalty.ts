/**
 * Deductions an admin has taken off a member's earned activity points.
 *
 * Kept in the domain layer with the rest of scoring so the rule is stated once
 * and can be tested with literals: every screen that shows a total, and the
 * weekly snapshot that freezes one, must agree on what a deduction does.
 */

/** Total taken off, from one member's deduction rows. */
export function totalPenalty(points: number[]): number {
  return points.reduce((sum, value) => sum + Math.max(0, value), 0);
}

/**
 * A member's activity-point total after deductions.
 *
 * Floored at zero rather than allowed to go negative. The percentage score is
 * derived from this net total afterward, so a 100-point deduction means one
 * completed 100-point activity rather than 100 percentage points.
 */
export function applyPenalty(totalPoints: number, penaltyPoints: number): number {
  return Math.max(0, totalPoints - Math.max(0, penaltyPoints));
}
