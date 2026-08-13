import { describe, expect, it } from "vitest";
import { moveItem } from "@/components/admin/order";

describe("moveItem", () => {
  it("swaps an item with the one above it", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  });

  it("swaps an item with the one below it", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("leaves the list alone when the first item moves up", () => {
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("leaves the list alone when the last item moves down", () => {
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("disturbs nothing outside the swapped pair", () => {
    expect(moveItem(["a", "b", "c", "d", "e"], 3, -1)).toEqual([
      "a",
      "b",
      "d",
      "c",
      "e",
    ]);
  });

  // The result feeds React state, so mutating the input would make the old and
  // new state the same object and skip the re-render.
  it("returns a new array without mutating the input", () => {
    const original = ["a", "b", "c"];
    const moved = moveItem(original, 1, -1);
    expect(original).toEqual(["a", "b", "c"]);
    expect(moved).not.toBe(original);
  });
});
