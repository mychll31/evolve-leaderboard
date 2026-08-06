import { describe, expect, it } from "vitest";
import { aggregate, combine, normalize, scoreBreakdown, scoreMember } from "@/domain/scoring";
import type { Entry, Metric } from "@/domain/types";

const metric = (over: Partial<Metric> = {}): Metric => ({
  id: "m1",
  key: "attendance",
  name: "Attendance",
  type: "percentage",
  weight: 40,
  target: null,
  ...over,
});

const entry = (over: Partial<Entry> = {}): Entry => ({
  metricId: "m1",
  meetingId: "mt1",
  value: 1,
  status: "approved",
  ...over,
});

describe("aggregate", () => {
  it("counts only approved entries", () => {
    const m = metric();
    const entries = [
      entry({ meetingId: "a" }),
      entry({ meetingId: "b", status: "pending" }),
      entry({ meetingId: "c", status: "rejected" }),
    ];
    // 1 approved of 3 held meetings.
    expect(aggregate(m, entries, 3)).toBeCloseTo(33.33, 1);
  });

  it("divides attendance by held meetings, not by entries recorded", () => {
    const m = metric();
    const entries = [
      entry({ meetingId: "a" }),
      entry({ meetingId: "b" }),
      entry({ meetingId: "c" }),
      entry({ meetingId: "d" }),
      entry({ meetingId: "e" }),
    ];
    // Present at 5 of 6 — a missing entry must count against you.
    expect(aggregate(m, entries, 6)).toBeCloseTo(83.33, 1);
  });

  it("returns 0 for attendance when no meetings have been held", () => {
    expect(aggregate(metric(), [], 0)).toBe(0);
  });

  it("sums integer metrics", () => {
    const m = metric({ id: "m2", type: "integer", target: 8 });
    const entries = [
      entry({ metricId: "m2", meetingId: null, value: 3 }),
      entry({ metricId: "m2", meetingId: null, value: 4 }),
    ];
    expect(aggregate(m, entries, 6)).toBe(7);
  });

  it("averages decimal metrics", () => {
    const m = metric({ id: "m3", type: "decimal", target: 10 });
    const entries = [
      entry({ metricId: "m3", meetingId: null, value: 6 }),
      entry({ metricId: "m3", meetingId: null, value: 9 }),
    ];
    expect(aggregate(m, entries, 6)).toBe(7.5);
  });

  it("takes the latest value for a manual score", () => {
    const m = metric({ id: "m4", type: "manual_score" });
    const entries = [
      entry({ metricId: "m4", meetingId: null, value: 5 }),
      entry({ metricId: "m4", meetingId: null, value: 8 }),
    ];
    expect(aggregate(m, entries, 6)).toBe(8);
  });

  it("ignores entries belonging to other metrics", () => {
    const m = metric({ id: "m2", type: "integer", target: 8 });
    const entries = [
      entry({ metricId: "m2", meetingId: null, value: 3 }),
      entry({ metricId: "other", meetingId: null, value: 99 }),
    ];
    expect(aggregate(m, entries, 6)).toBe(3);
  });
});

describe("normalize", () => {
  it("passes percentages through", () => {
    expect(normalize(metric(), 83.33)).toBeCloseTo(83.33, 2);
  });

  it("scales an integer metric against its target", () => {
    const m = metric({ type: "integer", target: 8 });
    expect(normalize(m, 7)).toBe(87.5);
  });

  it("clamps over-delivery to 100", () => {
    const m = metric({ type: "integer", target: 8 });
    expect(normalize(m, 9)).toBe(100);
  });

  it("returns 0 rather than Infinity when target is 0", () => {
    const m = metric({ type: "integer", target: 0 });
    expect(normalize(m, 7)).toBe(0);
  });

  it("returns 0 rather than NaN when target is null", () => {
    const m = metric({ type: "integer", target: null });
    expect(normalize(m, 7)).toBe(0);
  });

  it("maps booleans to 0 or 100", () => {
    const m = metric({ type: "boolean" });
    expect(normalize(m, 1)).toBe(100);
    expect(normalize(m, 0)).toBe(0);
  });

  it("scales a 1-10 manual score to 0-100", () => {
    const m = metric({ type: "manual_score" });
    expect(normalize(m, 8)).toBe(80);
  });
});

describe("combine", () => {
  const parts = [
    { weight: 40, value: 90 },
    { weight: 40, value: 80 },
    { weight: 20, value: 60 },
  ];

  it("weights by each metric's share of total weight", () => {
    // (90*40 + 80*40 + 60*20) / 100
    expect(combine(parts, "weighted")).toBeCloseTo(80, 5);
  });

  it("divides by total weight, so weights need not sum to 100", () => {
    const half = [
      { weight: 20, value: 90 },
      { weight: 20, value: 80 },
      { weight: 10, value: 60 },
    ];
    expect(combine(half, "weighted")).toBeCloseTo(80, 5);
  });

  it("sums raw values in points mode, which may exceed 100", () => {
    expect(combine(parts, "points")).toBe(230);
  });

  it("ignores weights entirely in average mode", () => {
    expect(combine(parts, "average")).toBeCloseTo(76.67, 2);
  });

  it("returns 0 rather than dividing by zero when all weights are 0", () => {
    const zeroed = parts.map((p) => ({ ...p, weight: 0 }));
    expect(combine(zeroed, "weighted")).toBe(0);
  });

  it("returns 0 for an empty metric set", () => {
    expect(combine([], "weighted")).toBe(0);
    expect(combine([], "points")).toBe(0);
    expect(combine([], "average")).toBe(0);
  });
});

describe("scoreMember", () => {
  const metrics: Metric[] = [
    metric({ id: "att", key: "attendance", type: "percentage", weight: 40 }),
    metric({ id: "asn", key: "assignment", type: "integer", weight: 40, target: 8 }),
    metric({ id: "quiz", key: "quiz", type: "integer", weight: 20, target: 10 }),
  ];

  const entries: Entry[] = [
    ...["a", "b", "c", "d", "e"].map((m) =>
      entry({ metricId: "att", meetingId: m }),
    ),
    entry({ metricId: "asn", meetingId: null, value: 7 }),
    entry({ metricId: "quiz", meetingId: null, value: 9 }),
  ];

  it("runs aggregate, normalise and combine end to end", () => {
    // att 5/6 = 83.33, asn 7/8 = 87.5, quiz 9/10 = 90
    // weighted: (83.33*40 + 87.5*40 + 90*20) / 100 = 86.33
    expect(scoreMember(metrics, entries, 6)).toBeCloseTo(86.33, 1);
  });

  it("exposes a breakdown whose parts recombine to the same score", () => {
    const parts = scoreBreakdown(metrics, entries, 6);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.metric.key)).toEqual([
      "attendance",
      "assignment",
      "quiz",
    ]);
    const recombined = combine(
      parts.map((p) => ({ weight: p.metric.weight, value: p.value })),
      "weighted",
    );
    expect(recombined).toBeCloseTo(scoreMember(metrics, entries, 6), 6);
  });

  it("scores a member with no entries as 0, not NaN", () => {
    expect(scoreMember(metrics, [], 6)).toBe(0);
  });
});
