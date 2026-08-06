import { describe, expect, it } from "vitest";
import { rankMembers } from "@/domain/ranking";
import type { RankableMember } from "@/domain/types";

const m = (
  membershipId: string,
  score: number,
  attendance = 90,
  name = membershipId,
): RankableMember => ({ membershipId, score, attendance, name });

describe("rankMembers", () => {
  it("orders by score descending", () => {
    const out = rankMembers([m("b", 80), m("a", 95), m("c", 60)]);
    expect(out.map((r) => r.membershipId)).toEqual(["a", "b", "c"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("gives tied scores the same rank and skips the next (1, 2, 2, 4)", () => {
    const out = rankMembers([
      m("a", 95),
      m("b", 80, 95),
      m("c", 80, 90),
      m("d", 60),
    ]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("orders tied members by attendance, without splitting their rank", () => {
    const out = rankMembers([m("low", 80, 70), m("high", 80, 99)]);
    expect(out.map((r) => r.membershipId)).toEqual(["high", "low"]);
    expect(out.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("falls back to name so ordering is deterministic", () => {
    const out = rankMembers([
      m("z", 80, 90, "Zoe"),
      m("a", 80, 90, "Amara"),
    ]);
    expect(out.map((r) => r.membershipId)).toEqual(["a", "z"]);
  });

  it("treats scores equal within floating-point noise as tied", () => {
    const out = rankMembers([m("a", 86.33333333333333), m("b", 86.33333333333334)]);
    expect(out.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("returns an empty list unchanged", () => {
    expect(rankMembers([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [m("b", 80), m("a", 95)];
    rankMembers(input);
    expect(input.map((r) => r.membershipId)).toEqual(["b", "a"]);
  });
});
