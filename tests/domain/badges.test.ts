import { describe, expect, it } from "vitest";
import {
  describeBadgeRule,
  evaluateBadgeRule,
  parseBadgeRule,
  serializeBadgeRule,
  type BadgeContext,
  type BadgeRule,
} from "@/domain/badges";

const ctx = (over: Partial<BadgeContext> = {}): BadgeContext => ({
  streak: 0,
  rank: 5,
  delta: 0,
  metrics: { attendance: 90, assignment: 80, quiz: 70 },
  recordedMetrics: ["attendance", "assignment"],
  isMostImproved: false,
  ...over,
});

describe("parseBadgeRule", () => {
  it("returns null for absent or malformed JSON", () => {
    expect(parseBadgeRule(null)).toBeNull();
    expect(parseBadgeRule("")).toBeNull();
    expect(parseBadgeRule("{not json")).toBeNull();
    expect(parseBadgeRule("[]")).toBeNull();
    expect(parseBadgeRule("null")).toBeNull();
    expect(parseBadgeRule('"streak"')).toBeNull();
  });

  it("returns null for an unrecognised rule type", () => {
    // A badge whose rule cannot be understood is never awarded automatically,
    // rather than breaking the rollup for everyone else.
    expect(parseBadgeRule('{"type":"vibes","threshold":3}')).toBeNull();
  });

  it("rejects rules missing their parameters", () => {
    expect(parseBadgeRule('{"type":"streak"}')).toBeNull();
    expect(parseBadgeRule('{"type":"streak","threshold":0}')).toBeNull();
    expect(parseBadgeRule('{"type":"metric_at_least","value":90}')).toBeNull();
    expect(
      parseBadgeRule('{"type":"metric_at_least","metricKey":"","value":90}'),
    ).toBeNull();
    expect(parseBadgeRule('{"type":"rank_at_most","value":0}')).toBeNull();
    expect(parseBadgeRule('{"type":"has_any_entry"}')).toBeNull();
  });

  it("parses each valid rule type", () => {
    expect(parseBadgeRule('{"type":"streak","threshold":5}')).toEqual({
      type: "streak",
      threshold: 5,
    });
    expect(
      parseBadgeRule(
        '{"type":"metric_at_least","metricKey":"attendance","value":100}',
      ),
    ).toEqual({ type: "metric_at_least", metricKey: "attendance", value: 100 });
    expect(parseBadgeRule('{"type":"all_metrics_at_least","value":100}')).toEqual(
      { type: "all_metrics_at_least", value: 100 },
    );
    expect(parseBadgeRule('{"type":"rank_at_most","value":1}')).toEqual({
      type: "rank_at_most",
      value: 1,
    });
    expect(parseBadgeRule('{"type":"most_improved"}')).toEqual({
      type: "most_improved",
    });
    expect(
      parseBadgeRule('{"type":"has_any_entry","metricKey":"assignment"}'),
    ).toEqual({ type: "has_any_entry", metricKey: "assignment" });
  });

  it("round-trips through serialise", () => {
    const rules: BadgeRule[] = [
      { type: "streak", threshold: 10 },
      { type: "metric_at_least", metricKey: "quiz", value: 95 },
      { type: "all_metrics_at_least", value: 100 },
      { type: "rank_at_most", value: 3 },
      { type: "most_improved" },
      { type: "has_any_entry", metricKey: "assignment" },
    ];
    for (const rule of rules) {
      expect(parseBadgeRule(serializeBadgeRule(rule))).toEqual(rule);
    }
  });
});

describe("evaluateBadgeRule", () => {
  it("awards a streak badge at the threshold, not before", () => {
    const rule: BadgeRule = { type: "streak", threshold: 5 };
    expect(evaluateBadgeRule(rule, ctx({ streak: 4 }))).toBe(false);
    expect(evaluateBadgeRule(rule, ctx({ streak: 5 }))).toBe(true);
    expect(evaluateBadgeRule(rule, ctx({ streak: 40 }))).toBe(true);
  });

  it("compares a single metric against its threshold", () => {
    const rule: BadgeRule = {
      type: "metric_at_least",
      metricKey: "attendance",
      value: 90,
    };
    expect(evaluateBadgeRule(rule, ctx())).toBe(true);
    expect(
      evaluateBadgeRule(rule, ctx({ metrics: { attendance: 89.9 } })),
    ).toBe(false);
  });

  it("never awards a metric rule naming a metric this season does not have", () => {
    const rule: BadgeRule = {
      type: "metric_at_least",
      metricKey: "sales",
      value: 0,
    };
    // Threshold of 0 would otherwise pass on an undefined value coerced to 0.
    expect(evaluateBadgeRule(rule, ctx())).toBe(false);
  });

  it("requires every metric to clear the bar", () => {
    const rule: BadgeRule = { type: "all_metrics_at_least", value: 100 };
    expect(evaluateBadgeRule(rule, ctx())).toBe(false);
    expect(
      evaluateBadgeRule(
        rule,
        ctx({ metrics: { attendance: 100, assignment: 100, quiz: 100 } }),
      ),
    ).toBe(true);
  });

  it("does not treat a season with no metrics as perfect in everything", () => {
    const rule: BadgeRule = { type: "all_metrics_at_least", value: 100 };
    expect(evaluateBadgeRule(rule, ctx({ metrics: {} }))).toBe(false);
  });

  it("checks rank inclusively and ignores an unranked member", () => {
    const rule: BadgeRule = { type: "rank_at_most", value: 3 };
    expect(evaluateBadgeRule(rule, ctx({ rank: 3 }))).toBe(true);
    expect(evaluateBadgeRule(rule, ctx({ rank: 4 }))).toBe(false);
    expect(evaluateBadgeRule(rule, ctx({ rank: 0 }))).toBe(false);
  });

  it("defers most-improved to the flag the rollup computes", () => {
    const rule: BadgeRule = { type: "most_improved" };
    expect(evaluateBadgeRule(rule, ctx({ delta: 9 }))).toBe(false);
    expect(evaluateBadgeRule(rule, ctx({ isMostImproved: true }))).toBe(true);
  });

  it("checks whether a metric has any recorded value at all", () => {
    expect(
      evaluateBadgeRule(
        { type: "has_any_entry", metricKey: "assignment" },
        ctx(),
      ),
    ).toBe(true);
    expect(
      evaluateBadgeRule({ type: "has_any_entry", metricKey: "quiz" }, ctx()),
    ).toBe(false);
  });
});

describe("describeBadgeRule", () => {
  it("summarises every rule type in plain language", () => {
    expect(describeBadgeRule({ type: "streak", threshold: 5 })).toBe(
      "Streak reaches 5 sessions",
    );
    expect(describeBadgeRule({ type: "rank_at_most", value: 1 })).toBe(
      "Finish the week at rank 1",
    );
    expect(describeBadgeRule({ type: "rank_at_most", value: 3 })).toBe(
      "Finish the week in the top 3",
    );
    expect(describeBadgeRule({ type: "most_improved" })).toBe(
      "Biggest rank gain of the week",
    );
  });
});
