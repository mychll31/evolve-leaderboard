/**
 * Badge award rules.
 *
 * Parameterised predicates rather than an expression language: a parser plus
 * sandbox would turn every admin typo into a silently un-awarded badge, and
 * nobody running an accountability programme wants to debug an expression.
 *
 * Pure — no I/O, no imports from `db`. The rollup supplies a context and reads
 * back a boolean.
 */

export const BADGE_RULE_TYPES = [
  "streak",
  "metric_at_least",
  "all_metrics_at_least",
  "rank_at_most",
  "most_improved",
  "has_any_entry",
] as const;

export type BadgeRuleType = (typeof BADGE_RULE_TYPES)[number];

export type BadgeRule =
  | { type: "streak"; threshold: number }
  | { type: "metric_at_least"; metricKey: string; value: number }
  | { type: "all_metrics_at_least"; value: number }
  | { type: "rank_at_most"; value: number }
  | { type: "most_improved" }
  | { type: "has_any_entry"; metricKey: string };

export type BadgeContext = {
  streak: number;
  rank: number;
  /** Rank movement since last week; positive means climbed. */
  delta: number;
  /** Normalised 0-100 value per metric key. */
  metrics: Record<string, number>;
  /** Metric keys with at least one recorded value. */
  recordedMetrics: string[];
  /** True when this member had the season's largest rank gain this week. */
  isMostImproved: boolean;
};

/**
 * Reads a rule out of `badges.ruleJson`.
 *
 * Returns null for absent, malformed or unrecognised rules. A badge whose rule
 * cannot be understood is simply never awarded automatically — it stays
 * displayable and manually grantable rather than breaking the whole rollup for
 * everyone else.
 */
export function parseBadgeRule(json: string | null): BadgeRule | null {
  if (!json) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;

  const rule = raw as Record<string, unknown>;
  const type = rule.type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "streak":
      return typeof rule.threshold === "number" && rule.threshold > 0
        ? { type, threshold: rule.threshold }
        : null;
    case "metric_at_least":
      return typeof rule.metricKey === "string" &&
        rule.metricKey.length > 0 &&
        typeof rule.value === "number"
        ? { type, metricKey: rule.metricKey, value: rule.value }
        : null;
    case "all_metrics_at_least":
      return typeof rule.value === "number"
        ? { type, value: rule.value }
        : null;
    case "rank_at_most":
      return typeof rule.value === "number" && rule.value >= 1
        ? { type, value: rule.value }
        : null;
    case "most_improved":
      return { type };
    case "has_any_entry":
      return typeof rule.metricKey === "string" && rule.metricKey.length > 0
        ? { type, metricKey: rule.metricKey }
        : null;
    default:
      return null;
  }
}

export function serializeBadgeRule(rule: BadgeRule): string {
  return JSON.stringify(rule);
}

/** Whether a member currently satisfies a rule. */
export function evaluateBadgeRule(
  rule: BadgeRule,
  context: BadgeContext,
): boolean {
  switch (rule.type) {
    case "streak":
      return context.streak >= rule.threshold;

    case "metric_at_least": {
      const value = context.metrics[rule.metricKey];
      // A metric that is not part of this season can never be satisfied.
      return value !== undefined && value >= rule.value;
    }

    case "all_metrics_at_least": {
      const values = Object.values(context.metrics);
      // Vacuously true is wrong here: a season with no metrics should not
      // hand everybody a "perfect in everything" badge.
      return values.length > 0 && values.every((v) => v >= rule.value);
    }

    case "rank_at_most":
      return context.rank > 0 && context.rank <= rule.value;

    case "most_improved":
      return context.isMostImproved;

    case "has_any_entry":
      return context.recordedMetrics.includes(rule.metricKey);
  }
}

/** Human-readable summary, for the admin builder and badge cards. */
export function describeBadgeRule(rule: BadgeRule): string {
  switch (rule.type) {
    case "streak":
      return `Streak reaches ${rule.threshold} sessions`;
    case "metric_at_least":
      return `${rule.metricKey} reaches ${rule.value}%`;
    case "all_metrics_at_least":
      return `Every metric reaches ${rule.value}%`;
    case "rank_at_most":
      return rule.value === 1
        ? "Finish the week at rank 1"
        : `Finish the week in the top ${rule.value}`;
    case "most_improved":
      return "Biggest rank gain of the week";
    case "has_any_entry":
      return `First ${rule.metricKey} recorded`;
  }
}
