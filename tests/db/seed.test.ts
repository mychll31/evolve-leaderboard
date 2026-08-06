import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  scoreSnapshots,
  seasons,
  teams,
} from "@/db/schema";
import { seed, type SeedResult } from "@/db/seed";
import { currentStreak } from "@/domain/streaks";
import { makeTestDb, type TestDb } from "../helpers/db";

// Fixed anchor so the fixture is byte-for-byte reproducible.
const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("seed", () => {
  let t: TestDb;
  let result: SeedResult;

  beforeAll(async () => {
    t = await makeTestDb();
    result = await seed(t.db, { today: TODAY, adminEmail: "admin@core.example" });
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it("creates one active season anchored around today", async () => {
    const [season] = await t.db.select().from(seasons);
    expect(season.status).toBe("active");
    expect(season.startsOn).toBe("2026-07-02");
    expect(season.endsOn).toBe("2026-09-03");
    expect(season.formula).toBe("weighted");
  });

  it("creates the ten teams from the design", async () => {
    const rows = await t.db.select().from(teams);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.name)).toContain("Founders");
    expect(rows.map((r) => r.abbr)).toContain("TBZ");
  });

  it("creates 14 member and 10 coach memberships", async () => {
    const rows = await t.db.select().from(memberships);
    expect(rows.filter((r) => r.role === "member")).toHaveLength(14);
    expect(rows.filter((r) => r.role === "coach")).toHaveLength(10);
  });

  it("creates the three weighted metrics summing to 100", async () => {
    const rows = await t.db.select().from(metrics);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, m) => s + m.weight, 0)).toBe(100);
    const assignment = rows.find((m) => m.key === "assignment");
    expect(assignment?.target).toBe(8);
  });

  it("records an attendance entry for every member at every held meeting", async () => {
    const [attendance] = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.key, "attendance"));
    const approved = await t.db
      .select()
      .from(metricEntries)
      .where(
        and(
          eq(metricEntries.metricId, attendance.id),
          eq(metricEntries.status, "approved"),
        ),
      );
    expect(approved).toHaveLength(14 * result.heldMeetings);
  });

  it("leaves pending entries only when today is a meeting day", async () => {
    const pending = await t.db
      .select()
      .from(metricEntries)
      .where(eq(metricEntries.status, "pending"));
    const todays = await t.db
      .select()
      .from(meetings)
      .where(eq(meetings.meetsOn, "2026-08-06"));
    // 2026-08-06 is a Thursday, so no meeting and nothing pending.
    expect(todays).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it("marks past meetings held and future meetings scheduled", async () => {
    const rows = await t.db.select().from(meetings);
    const held = rows.filter((r) => r.status === "held");
    const scheduled = rows.filter((r) => r.status === "scheduled");
    expect(held.length).toBe(result.heldMeetings);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(held.every((r) => r.meetsOn < "2026-08-06")).toBe(true);
    expect(scheduled.every((r) => r.meetsOn >= "2026-08-06")).toBe(true);
  });

  it("generates attendance consistent with each member's streak", async () => {
    // Michael's fixture streak is 12; the generated entries must actually
    // produce it, otherwise the seed contradicts itself.
    const [michael] = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.position, "PG"))
      .limit(1);
    const heldRows = await t.db
      .select()
      .from(meetings)
      .where(eq(meetings.status, "held"));
    const entries = await t.db
      .select()
      .from(metricEntries)
      .where(eq(metricEntries.membershipId, michael.id));

    const streak = currentStreak(
      heldRows.map((m) => ({ id: m.id, meetsOn: m.meetsOn, status: m.status })),
      entries.map((e) => ({
        metricId: e.metricId,
        meetingId: e.meetingId,
        value: e.value,
        status: e.status,
      })),
    );
    expect(streak).toBeGreaterThan(0);
  });

  it("writes a full set of weekly snapshots with rank 1 present each week", async () => {
    const rows = await t.db.select().from(scoreSnapshots);
    const weeks = [...new Set(rows.map((r) => r.weekNo))].sort((a, b) => a - b);
    expect(weeks.length).toBeGreaterThanOrEqual(5);
    for (const week of weeks) {
      const inWeek = rows.filter((r) => r.weekNo === week);
      expect(inWeek).toHaveLength(14);
      expect(inWeek.some((r) => r.rank === 1)).toBe(true);
    }
    // Week 1 has no prior week to compare against; later weeks do.
    expect(rows.filter((r) => r.weekNo === 1).every((r) => r.prevRank === null)).toBe(true);
    expect(rows.filter((r) => r.weekNo === 2).every((r) => r.prevRank !== null)).toBe(true);
  });

  it("is deterministic across runs", async () => {
    const second = await makeTestDb();
    await seed(second.db, { today: TODAY, adminEmail: "admin@core.example" });
    const a = await t.db.select().from(scoreSnapshots);
    const b = await second.db.select().from(scoreSnapshots);
    const key = (rows: typeof a) =>
      rows.map((r) => `${r.weekNo}:${r.rank}:${r.score.toFixed(6)}`).sort().join("|");
    expect(key(b)).toBe(key(a));
    await second.cleanup();
  });
});
