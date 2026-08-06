import { describe, expect, it } from "vitest";
import { currentStreak } from "@/domain/streaks";
import type { Entry, Meeting, MeetingStatus } from "@/domain/types";

const meeting = (
  id: string,
  meetsOn: string,
  status: MeetingStatus = "held",
): Meeting => ({ id, meetsOn, status });

const present = (meetingId: string, over: Partial<Entry> = {}): Entry => ({
  metricId: "att",
  meetingId,
  value: 1,
  status: "approved",
  ...over,
});

const week: Meeting[] = [
  meeting("m1", "2026-08-03"),
  meeting("m2", "2026-08-05"),
  meeting("m3", "2026-08-07"),
];

describe("currentStreak", () => {
  it("counts every held meeting when all were attended", () => {
    expect(currentStreak(week, week.map((m) => present(m.id)))).toBe(3);
  });

  it("stops at the most recent absence", () => {
    const entries = [present("m1"), present("m2"), present("m3", { value: 0 })];
    expect(currentStreak(week, entries)).toBe(0);
  });

  it("counts back only as far as the last absence", () => {
    const entries = [present("m1", { value: 0 }), present("m2"), present("m3")];
    expect(currentStreak(week, entries)).toBe(2);
  });

  it("treats a missing entry for a held meeting as a break", () => {
    // No entry at all for m2 — that must not silently count as present.
    expect(currentStreak(week, [present("m1"), present("m3")])).toBe(1);
  });

  it("skips an undecided check-in instead of breaking the streak", () => {
    // Pending means the coach has not judged it yet. Treating that as an
    // absence would cost a member their streak purely because approval was
    // late, so the session is skipped and the count continues behind it.
    const entries = [
      present("m1"),
      present("m2"),
      present("m3", { status: "pending" }),
    ];
    expect(currentStreak(week, entries)).toBe(2);
  });

  it("does not let a pending entry add to the streak either", () => {
    const entries = [present("m1", { status: "pending" }), present("m2"), present("m3")];
    // m1 is skipped rather than counted, so only m2 and m3 contribute.
    expect(currentStreak(week, entries)).toBe(2);
  });

  it("does not count a rejected entry as present", () => {
    const entries = [present("m1"), present("m2", { status: "rejected" }), present("m3")];
    expect(currentStreak(week, entries)).toBe(1);
  });

  it("skips cancelled meetings without breaking the streak", () => {
    const withCancelled = [
      meeting("m1", "2026-08-03"),
      meeting("x", "2026-08-04", "cancelled"),
      meeting("m2", "2026-08-05"),
    ];
    expect(currentStreak(withCancelled, [present("m1"), present("m2")])).toBe(2);
  });

  it("ignores meetings that have not happened yet", () => {
    const withFuture = [
      meeting("m1", "2026-08-03"),
      meeting("m2", "2026-08-05"),
      meeting("future", "2026-09-01", "scheduled"),
    ];
    expect(currentStreak(withFuture, [present("m1"), present("m2")])).toBe(2);
  });

  it("returns 0 when no meetings have been held", () => {
    expect(currentStreak([], [])).toBe(0);
    expect(currentStreak([meeting("f", "2026-09-01", "scheduled")], [])).toBe(0);
  });

  it("orders by date rather than array position", () => {
    const shuffled = [week[2], week[0], week[1]];
    expect(currentStreak(shuffled, week.map((m) => present(m.id)))).toBe(3);
  });
});
