import { describe, expect, it } from "vitest";
import type { Metric } from "@/domain/types";

describe("test harness", () => {
  it("resolves the @/ alias into src/", () => {
    const metric: Metric = { id: "m1", key: "attendance", name: "Attendance" };
    expect(metric.key).toBe("attendance");
  });
});
