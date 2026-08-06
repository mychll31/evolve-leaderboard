import { describe, expect, it } from "vitest";
import { FORMULAS, METRIC_TYPES } from "@/domain/types";

describe("test harness", () => {
  it("resolves the @/ alias into src/", () => {
    expect(METRIC_TYPES).toContain("percentage");
    expect(FORMULAS).toEqual(["weighted", "points", "average"]);
  });
});
