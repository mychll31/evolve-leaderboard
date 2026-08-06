import type { Formula } from "../types";

export type WeightedPart = { weight: number; value: number };

/**
 * Reduces normalised per-metric values to a single score under the season's
 * chosen formula.
 *
 * `weighted` divides by the *actual* total weight rather than by 100, so an
 * admin whose weights sum to 90 or 110 still gets a sensible 0-100 score. The
 * builder warns at anything other than 100, but never produces nonsense.
 */
export function combine(parts: WeightedPart[], formula: Formula): number {
  if (parts.length === 0) return 0;

  switch (formula) {
    case "weighted": {
      const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
      if (totalWeight <= 0) return 0;
      const weighted = parts.reduce((sum, p) => sum + p.value * p.weight, 0);
      return weighted / totalWeight;
    }
    case "points":
      return parts.reduce((sum, p) => sum + p.value, 0);
    case "average":
      return parts.reduce((sum, p) => sum + p.value, 0) / parts.length;
  }
}
