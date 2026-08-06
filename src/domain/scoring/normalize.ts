import type { Metric } from "../types";

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Puts every metric on the same 0-100 scale so they can be weighed against
 * each other. Without this step "Assignments: 7" and "Attendance: 93%" are
 * incommensurable and no formula can combine them.
 *
 * `integer` and `decimal` scale against `metric.target`. A missing or
 * non-positive target yields 0 rather than `Infinity` or `NaN` — a
 * misconfigured metric should read as "no credit", never poison the score.
 */
export function normalize(metric: Metric, raw: number): number {
  switch (metric.type) {
    case "percentage":
      return clamp(raw);
    case "boolean":
      return raw ? 100 : 0;
    case "manual_score":
      return clamp(raw * 10);
    case "integer":
    case "decimal": {
      const { target } = metric;
      if (target === null || target <= 0) return 0;
      return clamp((raw / target) * 100);
    }
  }
}
