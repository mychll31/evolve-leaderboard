const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Metrics are recorded directly on a 0-100 scale. Values are clamped at the
 * scoring boundary so a bad import cannot poison totals or exceed 100%.
 */
export function normalize(raw: number): number {
  return clamp(raw);
}
