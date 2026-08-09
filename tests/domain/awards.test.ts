import { describe, expect, it } from "vitest";
import {
  describeAwardCategory,
  selectWeeklyAwards,
  type AwardCandidate,
} from "@/domain/awards";

const c = (
  membershipId: string,
  over: Partial<AwardCandidate> = {},
): AwardCandidate => ({
  membershipId,
  name: membershipId,
  score: 80,
  delta: 0,
  metrics: { attendance: 90, assignment: 80 },
  hasPreviousRank: true,
  ...over,
});

describe("selectWeeklyAwards", () => {
  it("returns nothing for an empty season", () => {
    expect(selectWeeklyAwards([], ["attendance"])).toEqual([]);
  });

  it("awards overall to the highest score", () => {
    const awards = selectWeeklyAwards(
      [c("a", { score: 70 }), c("b", { score: 95 }), c("c", { score: 88 })],
      [],
    );
    expect(awards).toEqual([
      { category: "overall", membershipId: "b", value: 95 },
    ]);
  });

  it("awards a best-in-metric slot per metric", () => {
    const awards = selectWeeklyAwards(
      [
        c("a", { metrics: { attendance: 100, assignment: 60 } }),
        c("b", { metrics: { attendance: 80, assignment: 99 } }),
      ],
      ["attendance", "assignment"],
    );
    expect(awards.find((a) => a.category === "metric:attendance")).toEqual({
      category: "metric:attendance",
      membershipId: "a",
      value: 100,
    });
    expect(awards.find((a) => a.category === "metric:assignment")).toEqual({
      category: "metric:assignment",
      membershipId: "b",
      value: 99,
    });
  });

  it("treats a missing metric value as zero rather than skipping the member", () => {
    const awards = selectWeeklyAwards(
      [c("a", { metrics: {} }), c("b", { metrics: { quiz: 10 } })],
      ["quiz"],
    );
    expect(awards.find((a) => a.category === "metric:quiz")?.membershipId).toBe(
      "b",
    );
  });

  it("awards most improved to the biggest climb", () => {
    const awards = selectWeeklyAwards(
      [c("a", { delta: 2 }), c("b", { delta: 7 }), c("c", { delta: -3 })],
      [],
    );
    expect(awards.find((a) => a.category === "most_improved")).toEqual({
      category: "most_improved",
      membershipId: "b",
      value: 7,
    });
  });

  it("skips most improved when nobody climbed", () => {
    const awards = selectWeeklyAwards(
      [c("a", { delta: 0 }), c("b", { delta: -2 })],
      [],
    );
    expect(awards.some((a) => a.category === "most_improved")).toBe(false);
  });

  it("skips most improved in a first week, where nobody has a prior rank", () => {
    // Everyone's delta is 0 with no history; handing the award to whoever
    // sorts first would be meaningless.
    const awards = selectWeeklyAwards(
      [
        c("a", { delta: 5, hasPreviousRank: false }),
        c("b", { delta: 3, hasPreviousRank: false }),
      ],
      [],
    );
    expect(awards.some((a) => a.category === "most_improved")).toBe(false);
  });

  it("breaks ties on name so a re-run settles on the same member", () => {
    const first = selectWeeklyAwards(
      [
        c("x", { name: "Zoe", score: 90 }),
        c("y", { name: "Amara", score: 90 }),
      ],
      [],
    );
    const second = selectWeeklyAwards(
      [
        c("y", { name: "Amara", score: 90 }),
        c("x", { name: "Zoe", score: 90 }),
      ],
      [],
    );
    expect(first[0].membershipId).toBe("y");
    expect(second[0].membershipId).toBe("y");
  });

  it("handles a season with a single member", () => {
    const awards = selectWeeklyAwards([c("solo", { score: 42 })], ["attendance"]);
    expect(awards.map((a) => a.category)).toEqual([
      "overall",
      "metric:attendance",
    ]);
  });
});

describe("describeAwardCategory", () => {
  it("names each slot in plain language", () => {
    expect(describeAwardCategory("overall")).toBe("Most Valuable Player");
    expect(describeAwardCategory("most_improved")).toBe("Most Improved");
    expect(describeAwardCategory("coach_choice")).toBe("Leader's Choice");
    expect(
      describeAwardCategory("metric:attendance", { attendance: "Attendance" }),
    ).toBe("Best Attendance");
  });

  it("falls back to the raw key when a metric name is unknown", () => {
    expect(describeAwardCategory("metric:sales")).toBe("Best sales");
  });
});
