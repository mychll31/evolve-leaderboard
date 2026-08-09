import { describe, expect, it } from "vitest";
import {
  aggregate,
  combine,
  normalize,
  scoreBreakdown,
  scoreMember,
} from "@/domain/scoring";
import type { Entry, Metric } from "@/domain/types";

const metric = (over: Partial<Metric> = {}): Metric => ({
  id: "m1",
  key: "attendance",
  name: "Attendance",
  ...over,
});

const entry = (over: Partial<Entry> = {}): Entry => ({
  metricId: "m1",
  meetingId: null,
  value: 80,
  status: "approved",
  ...over,
});

describe("aggregate", () => {
  it("uses only approved entries", () => {
    const entries = [
      entry({ value: 90 }),
      entry({ value: 10, status: "pending" }),
      entry({ value: 20, status: "rejected" }),
    ];
    expect(aggregate(metric(), entries, 0)).toBe(90);
  });

  it("takes the latest season-level value", () => {
    const entries = [entry({ value: 50 }), entry({ value: 88 })];
    expect(aggregate(metric(), entries, 0)).toBe(88);
  });

  it("averages legacy calendar-bound rows when no season-level value exists", () => {
    const entries = [
      entry({ meetingId: "a", value: 100 }),
      entry({ meetingId: "b", value: 70 }),
      entry({ meetingId: "c", value: 40 }),
    ];
    expect(aggregate(metric(), entries, 3)).toBe(70);
  });

  it("ignores entries belonging to other metrics", () => {
    const entries = [
      entry({ value: 60 }),
      entry({ metricId: "other", value: 100 }),
    ];
    expect(aggregate(metric(), entries, 0)).toBe(60);
  });

  it("returns 0 when nothing approved exists", () => {
    expect(aggregate(metric(), [entry({ status: "pending" })], 0)).toBe(0);
  });
});

describe("normalize", () => {
  it("passes 0-100 values through", () => {
    expect(normalize(83.33)).toBeCloseTo(83.33, 2);
  });

  it("clamps below 0 and above 100", () => {
    expect(normalize(-12)).toBe(0);
    expect(normalize(140)).toBe(100);
  });
});

describe("combine", () => {
  it("averages all metric values equally", () => {
    expect(combine([{ value: 90 }, { value: 80 }, { value: 60 }])).toBeCloseTo(
      76.67,
      2,
    );
  });

  it("returns 0 for an empty metric set", () => {
    expect(combine([])).toBe(0);
  });
});

describe("scoreMember", () => {
  const metrics: Metric[] = [
    metric({ id: "att", key: "attendance", name: "Attendance" }),
    metric({ id: "asn", key: "assignment", name: "Assignment" }),
    metric({ id: "quiz", key: "quiz", name: "Quiz" }),
  ];

  const entries: Entry[] = [
    entry({ metricId: "att", value: 90 }),
    entry({ metricId: "asn", value: 80 }),
    entry({ metricId: "quiz", value: 70 }),
  ];

  it("runs aggregate, normalise and equal combine end to end", () => {
    expect(scoreMember(metrics, entries, 0)).toBe(80);
  });

  it("exposes a breakdown whose parts recombine to the same score", () => {
    const parts = scoreBreakdown(metrics, entries, 0);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.metric.key)).toEqual([
      "attendance",
      "assignment",
      "quiz",
    ]);
    expect(combine(parts.map((p) => ({ value: p.value })))).toBe(
      scoreMember(metrics, entries, 0),
    );
  });

  it("scores a member with no entries as 0, not NaN", () => {
    expect(scoreMember(metrics, [], 0)).toBe(0);
  });
});
