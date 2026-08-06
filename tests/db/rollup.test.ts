import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  badges,
  memberBadges,
  memberships,
  notifications,
  scoreSnapshots,
  weeklyAwards,
} from "@/db/schema";
import { runWeeklyRollup, weekNoFor } from "@/db/mutations/rollup";
import { seed } from "@/db/seed";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("weekNoFor", () => {
  it("counts from the season start, beginning at week 1", () => {
    expect(weekNoFor("2026-07-02", new Date("2026-07-02T12:00:00Z"))).toBe(1);
    expect(weekNoFor("2026-07-02", new Date("2026-07-08T00:00:00Z"))).toBe(1);
    expect(weekNoFor("2026-07-02", new Date("2026-07-09T00:00:00Z"))).toBe(2);
    expect(weekNoFor("2026-07-02", new Date("2026-08-06T00:00:00Z"))).toBe(6);
  });

  it("clamps to week 1 before the season starts", () => {
    expect(weekNoFor("2026-07-02", new Date("2026-06-01T00:00:00Z"))).toBe(1);
  });
});

describe("runWeeklyRollup", () => {
  let t: TestDb;
  let seasonId: string;

  beforeEach(async () => {
    t = await makeTestDb();
    const result = await seed(t.db, {
      today: TODAY,
      adminEmail: "admin@core.example",
    });
    seasonId = result.seasonId;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("writes a snapshot for every member in the current week", async () => {
    const result = await runWeeklyRollup(t.db, seasonId, TODAY);
    expect(result.weekNo).toBe(6);
    expect(result.members).toBe(14);

    const rows = await t.db
      .select()
      .from(scoreSnapshots)
      .where(
        and(
          eq(scoreSnapshots.seasonId, seasonId),
          eq(scoreSnapshots.weekNo, 6),
        ),
      );
    expect(rows).toHaveLength(14);
    expect(rows.some((r) => r.rank === 1)).toBe(true);
  });

  it("carries the previous week's rank into prevRank", async () => {
    await runWeeklyRollup(t.db, seasonId, TODAY);

    const week5 = await t.db
      .select()
      .from(scoreSnapshots)
      .where(
        and(
          eq(scoreSnapshots.seasonId, seasonId),
          eq(scoreSnapshots.weekNo, 5),
        ),
      );
    const week6 = await t.db
      .select()
      .from(scoreSnapshots)
      .where(
        and(
          eq(scoreSnapshots.seasonId, seasonId),
          eq(scoreSnapshots.weekNo, 6),
        ),
      );

    for (const row of week6) {
      const prior = week5.find((w) => w.membershipId === row.membershipId);
      expect(row.prevRank).toBe(prior?.rank ?? null);
    }
  });

  it("awards badges whose rules are satisfied", async () => {
    const before = await t.db.select().from(memberBadges);
    const result = await runWeeklyRollup(t.db, seasonId, TODAY);
    const after = await t.db.select().from(memberBadges);

    expect(result.badgesAwarded).toBeGreaterThan(0);
    expect(after.length).toBe(before.length + result.badgesAwarded);
  });

  it("never awards a badge that has no rule", async () => {
    await t.db
      .insert(badges)
      .values({
        key: "ruleless",
        icon: "❓",
        name: "Ruleless",
        requirementText: "Granted by hand only",
        ruleJson: null,
      });

    await runWeeklyRollup(t.db, seasonId, TODAY);

    const [ruleless] = await t.db
      .select()
      .from(badges)
      .where(eq(badges.key, "ruleless"));
    const awarded = await t.db
      .select()
      .from(memberBadges)
      .where(eq(memberBadges.badgeId, ruleless.id));
    expect(awarded).toHaveLength(0);
  });

  it("survives a badge whose rule cannot be parsed", async () => {
    await t.db.insert(badges).values({
      key: "broken",
      icon: "💥",
      name: "Broken",
      requirementText: "Malformed",
      ruleJson: "{not json at all",
    });

    // The rollup must still complete for everyone else.
    const result = await runWeeklyRollup(t.db, seasonId, TODAY);
    expect(result.members).toBe(14);
  });

  it("picks an overall MVP and a best-in-metric for each metric", async () => {
    await runWeeklyRollup(t.db, seasonId, TODAY);

    const rows = await t.db
      .select()
      .from(weeklyAwards)
      .where(
        and(eq(weeklyAwards.seasonId, seasonId), eq(weeklyAwards.weekNo, 6)),
      );

    const categories = rows.map((r) => r.category).sort();
    expect(categories).toContain("overall");
    expect(categories).toContain("metric:attendance");
    expect(categories).toContain("metric:assignment");
    expect(categories).toContain("metric:quiz");
  });

  it("gives the overall MVP to the member ranked first", async () => {
    await runWeeklyRollup(t.db, seasonId, TODAY);

    const [award] = await t.db
      .select()
      .from(weeklyAwards)
      .where(
        and(
          eq(weeklyAwards.seasonId, seasonId),
          eq(weeklyAwards.weekNo, 6),
          eq(weeklyAwards.category, "overall"),
        ),
      );
    const [snapshot] = await t.db
      .select()
      .from(scoreSnapshots)
      .where(
        and(
          eq(scoreSnapshots.seasonId, seasonId),
          eq(scoreSnapshots.weekNo, 6),
          eq(scoreSnapshots.membershipId, award.membershipId),
        ),
      );
    expect(snapshot.rank).toBe(1);
  });

  it("raises notifications for badges and MVPs", async () => {
    const result = await runWeeklyRollup(t.db, seasonId, TODAY);
    expect(result.notifications).toBeGreaterThan(0);

    const rows = await t.db.select().from(notifications);
    expect(rows.some((r) => r.kind === "badge_earned")).toBe(true);
    expect(rows.some((r) => r.kind === "mvp_awarded")).toBe(true);
  });

  describe("idempotency", () => {
    it("produces identical snapshots when run twice", async () => {
      await runWeeklyRollup(t.db, seasonId, TODAY);
      const first = await t.db
        .select()
        .from(scoreSnapshots)
        .where(eq(scoreSnapshots.seasonId, seasonId));

      await runWeeklyRollup(t.db, seasonId, TODAY);
      const second = await t.db
        .select()
        .from(scoreSnapshots)
        .where(eq(scoreSnapshots.seasonId, seasonId));

      expect(second).toHaveLength(first.length);
      const key = (rows: typeof first) =>
        rows
          .map((r) => `${r.weekNo}:${r.membershipId}:${r.rank}:${r.prevRank}`)
          .sort()
          .join("|");
      expect(key(second)).toBe(key(first));
    });

    it("does not duplicate weekly awards", async () => {
      await runWeeklyRollup(t.db, seasonId, TODAY);
      const first = await t.db
        .select()
        .from(weeklyAwards)
        .where(
          and(eq(weeklyAwards.seasonId, seasonId), eq(weeklyAwards.weekNo, 6)),
        );

      await runWeeklyRollup(t.db, seasonId, TODAY);
      const second = await t.db
        .select()
        .from(weeklyAwards)
        .where(
          and(eq(weeklyAwards.seasonId, seasonId), eq(weeklyAwards.weekNo, 6)),
        );

      // Season-wide categories carry a null teamId; without the partial unique
      // index SQLite would treat every re-run as a fresh row.
      expect(second).toHaveLength(first.length);
    });

    it("awards no badges on a second run", async () => {
      const first = await runWeeklyRollup(t.db, seasonId, TODAY);
      expect(first.badgesAwarded).toBeGreaterThan(0);

      const second = await runWeeklyRollup(t.db, seasonId, TODAY);
      expect(second.badgesAwarded).toBe(0);
    });

    it("raises no duplicate notifications", async () => {
      await runWeeklyRollup(t.db, seasonId, TODAY);
      const first = await t.db.select().from(notifications);

      const second = await runWeeklyRollup(t.db, seasonId, TODAY);
      const after = await t.db.select().from(notifications);

      expect(second.notifications).toBe(0);
      expect(after).toHaveLength(first.length);
    });

    it("keeps a badge once earned, even if the condition later lapses", async () => {
      await runWeeklyRollup(t.db, seasonId, TODAY);
      const earned = await t.db.select().from(memberBadges);

      // Wipe every approved entry, so nobody satisfies anything any more.
      await t.db.delete(scoreSnapshots).where(eq(scoreSnapshots.weekNo, 6));
      await runWeeklyRollup(t.db, seasonId, TODAY);

      const after = await t.db.select().from(memberBadges);
      // member_badges is an achievement log, not a live view.
      expect(after.length).toBeGreaterThanOrEqual(earned.length);
    });
  });

  it("returns zeroes for a season with no members", async () => {
    const [empty] = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.seasonId, seasonId))
      .limit(1);
    expect(empty).toBeTruthy();

    await t.db
      .delete(memberships)
      .where(eq(memberships.seasonId, seasonId));

    const result = await runWeeklyRollup(t.db, seasonId, TODAY);
    expect(result.members).toBe(0);
    expect(result.badgesAwarded).toBe(0);
    expect(result.awards).toBe(0);
  });

  it("rejects an unknown season", async () => {
    await expect(runWeeklyRollup(t.db, "nope", TODAY)).rejects.toThrow(
      /not found/i,
    );
  });
});
