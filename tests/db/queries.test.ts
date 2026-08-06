import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scoreSnapshots, teams } from "@/db/schema";
import { getBadges } from "@/db/queries/badges";
import { getCoachDesk } from "@/db/queries/coach";
import {
  getActiveSeason,
  getStandings,
  type Standings,
} from "@/db/queries/standings";
import { getTeamStandings } from "@/db/queries/teams";
import { seed } from "@/db/seed";
import { combine } from "@/domain/scoring/combine";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("query layer", () => {
  let t: TestDb;
  let standings: Standings;

  beforeAll(async () => {
    t = await makeTestDb();
    await seed(t.db, { today: TODAY, adminEmail: "admin@core.example" });
    const season = await getActiveSeason(t.db);
    standings = await getStandings(t.db, season!, TODAY);
  });

  afterAll(async () => {
    await t.cleanup();
  });

  describe("getStandings", () => {
    it("finds the active season", () => {
      expect(standings.season.name).toBe("Leaderboard Season 1");
      expect(standings.season.status).toBe("active");
    });

    it("returns every member, excluding coaches", () => {
      expect(standings.members).toHaveLength(14);
      expect(standings.memberCount).toBe(14);
      expect(standings.teamCount).toBe(10);
    });

    it("orders members by rank starting at 1", () => {
      expect(standings.members[0].rank).toBe(1);
      const ranks = standings.members.map((m) => m.rank);
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    });

    it("gives rank 1 to whoever actually has the highest score", () => {
      const best = Math.max(...standings.members.map((m) => m.score));
      expect(standings.members[0].rank).toBe(1);
      expect(standings.members[0].score).toBeCloseTo(best, 6);
    });

    it("gives every member a breakdown covering all active metrics", () => {
      for (const member of standings.members) {
        expect(member.breakdown.map((b) => b.key)).toEqual([
          "attendance",
          "assignment",
          "quiz",
        ]);
      }
    });

    it("produces a breakdown that recombines to the reported score", () => {
      for (const member of standings.members) {
        const recombined = combine(
          member.breakdown.map((b) => ({ weight: b.weight, value: b.value })),
          "weighted",
        );
        expect(recombined).toBeCloseTo(member.score, 6);
      }
    });

    it("keeps every normalised value inside 0-100", () => {
      for (const member of standings.members) {
        for (const part of member.breakdown) {
          expect(part.value).toBeGreaterThanOrEqual(0);
          expect(part.value).toBeLessThanOrEqual(100);
        }
      }
    });

    it("computes week number and days remaining from the season dates", () => {
      expect(standings.weekNo).toBe(6);
      expect(standings.daysLeft).toBe(28);
    });

    it("rolls up attendance for every held meeting", () => {
      expect(standings.attendanceByMeeting).toHaveLength(standings.heldCount);
      for (const row of standings.attendanceByMeeting) {
        expect(row.total).toBe(14);
        expect(row.present).toBeGreaterThan(0);
        expect(row.present).toBeLessThanOrEqual(row.total);
      }
    });

    it("derives streaks from real entries", () => {
      const michael = standings.members.find((m) => m.name === "Michael")!;
      expect(michael.streak).toBeGreaterThan(0);
      expect(michael.streak).toBeLessThanOrEqual(standings.heldCount);
    });

    it("keeps a streak alive when the latest session is still awaiting approval", () => {
      // Regression: the entry query used to filter to `approved` in SQL, so the
      // streak counter could not tell a pending check-in from a no-show and
      // reset the member to zero the moment a coach fell behind.
      const michael = standings.members.find((m) => m.name === "Michael")!;
      expect(michael.streak).toBe(standings.heldCount - 1);
    });

    it("still excludes unapproved entries from the score", () => {
      const michael = standings.members.find((m) => m.name === "Michael")!;
      const attendance = michael.breakdown.find((b) => b.key === "attendance")!;
      // 14 of 15 approved: the pending session must not count as present.
      expect(attendance.value).toBeCloseTo((14 / 15) * 100, 4);
    });
  });

  describe("getTeamStandings", () => {
    it("ranks all ten teams by summed member score", async () => {
      const rows = await getTeamStandings(t.db, standings);
      expect(rows).toHaveLength(10);
      expect(rows[0].rank).toBe(1);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points);
      }
    });

    it("totals team points from member scores, not an arbitrary multiplier", async () => {
      const rows = await getTeamStandings(t.db, standings);
      for (const team of rows) {
        const expected = standings.members
          .filter((m) => m.teamId === team.teamId)
          .reduce((sum, m) => sum + m.score, 0);
        expect(team.points).toBeCloseTo(expected, 6);
      }
    });

    it("names each team's coach", async () => {
      const rows = await getTeamStandings(t.db, standings);
      const founders = rows.find((r) => r.name === "Founders");
      expect(founders?.coachName).toBe("John Doe");
    });

    it("awards exactly one win per snapshot week across all teams", async () => {
      const rows = await getTeamStandings(t.db, standings);
      const snapshots = await t.db.select().from(scoreSnapshots);
      const weeks = new Set(snapshots.map((s) => s.weekNo)).size;

      // Note this is 5, not 6: the season is in its sixth week but only five
      // weeks of meetings have been held, so there are five snapshot weeks.
      expect(weeks).toBe(5);
      expect(rows.reduce((s, r) => s + r.wins, 0)).toBe(weeks);
    });

    it("identifies top and bottom players per team", async () => {
      const rows = await getTeamStandings(t.db, standings);
      const founders = rows.find((r) => r.name === "Founders")!;
      expect(founders.topPlayer?.name).toBe("Michael");
      expect(founders.topPlayer!.rank).toBeLessThan(
        founders.bottomPlayer!.rank,
      );
    });
  });

  describe("getCoachDesk", () => {
    it("scopes the roster to a single team", async () => {
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      const desk = await getCoachDesk(t.db, standings, founders.id, TODAY);

      expect(desk).not.toBeNull();
      expect(desk!.teamName).toBe("Founders");
      // Founders has Michael and Noah in the fixture.
      expect(desk!.rows).toHaveLength(2);
      expect(desk!.rows.map((r) => r.name).sort()).toEqual(["Michael", "Noah"]);
    });

    it("falls back to the most recent held meeting when today has none", async () => {
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      const desk = await getCoachDesk(t.db, standings, founders.id, TODAY);
      expect(desk!.meeting).not.toBeNull();
      expect(desk!.meeting!.isToday).toBe(false);
      expect(desk!.meeting!.meetsOn < "2026-08-06").toBe(true);
    });

    it("counts states so they account for the whole roster", async () => {
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      const desk = await getCoachDesk(t.db, standings, founders.id, TODAY);
      expect(
        desk!.pendingCount + desk!.presentCount + desk!.missingCount,
      ).toBe(desk!.rows.length);
    });

    it("returns null for a team that does not exist", async () => {
      expect(await getCoachDesk(t.db, standings, "nope", TODAY)).toBeNull();
    });
  });

  describe("getBadges", () => {
    it("flags which badges a member has earned", async () => {
      const michael = standings.members.find((m) => m.name === "Michael")!;
      const rows = await getBadges(t.db, michael.membershipId);
      expect(rows).toHaveLength(6);
      expect(rows.filter((b) => b.owned).length).toBeGreaterThan(0);
      expect(rows.find((b) => b.key === "mvp")?.owned).toBe(true);
    });

    it("shows everything locked for a user with no membership", async () => {
      const rows = await getBadges(t.db, null);
      expect(rows.every((b) => !b.owned)).toBe(true);
    });
  });
});
