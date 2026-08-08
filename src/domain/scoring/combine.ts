export type ScorePart = { value: number };

/**
 * Every active metric counts equally. Missing values enter as 0 upstream, so
 * the total is always the average of the metric values on a 0-100 scale.
 */
export function combine(parts: ScorePart[]): number {
  if (parts.length === 0) return 0;
  return parts.reduce((sum, part) => sum + part.value, 0) / parts.length;
}
