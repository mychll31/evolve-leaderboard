import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memberships, penalties, seasons, users } from "@/db/schema";
import {
  ConflictError,
  NotFoundError,
  SeasonLockedError,
} from "@/db/mutations/guards";
import { addPenalty, deletePenalty } from "@/db/mutations/penalties";
import { listPenalties, listPenaltyTargets } from "@/db/queries/admin";
import { getMemberDetail } from "@/db/queries/member";
import {
  getActiveSeason,
  getStandings,
  type Standings,
} from "@/db/queries/standings";
import { getTeamStandings } from "@/db/queries/teams";
import { seed } from "@/db/seed";
import { AuthorizationError, type Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("minus points", () => {
  let t: TestDb;
  let seasonId: string;
  let admin: Actor;
  let adminName: string;
  let coach: Actor;

  /** Whoever is top of the board, who therefore has the most to lose. */
  let target: Standings["members"][number];

  const standingsNow = async () => {
    const season = await getActiveSeason(t.db);
    return getStandings(t.db, season!, TODAY);
  };

  beforeEach(async () => {
    t = await makeTestDb();
    const result = await seed(t.db, {
      today: TODAY,
      adminEmail: "admin@core.example",
    });
    seasonId = result.seasonId;

    const [adminRow] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, "admin@core.example"));
    admin = { id: adminRow.id, role: "super_admin" };
    adminName = adminRow.name!;

    const all = await t.db.select().from(memberships);
    coach = {
      id: all.find((m) => m.role === "coach")!.userId,
      role: "user",
    };

    const standings = await standingsNow();
    target = standings.members[0];
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("issuing", () => {
    it("takes activity points off before calculating the score", async () => {
      const before = target.score;
      const beforePoints = target.activityPoints;

      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 10,
        reason: "Missed two sessions",
      });

      const after = await standingsNow();
      const row = after.members.find(
        (m) => m.membershipId === target.membershipId,
      )!;

      expect(row.activityPoints).toBeCloseTo(beforePoints - 10, 6);
      expect(row.score).toBeCloseTo(
        before - 10 / target.breakdown.length,
        6,
      );
      expect(row.baseScore).toBeCloseTo(before, 6);
      expect(row.baseActivityPoints).toBeCloseTo(beforePoints, 6);
      expect(row.penaltyPoints).toBe(10);
    });

    it("adds several deductions together", async () => {
      const before = target.score;

      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 4,
      });
      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 6.5,
      });

      const after = await standingsNow();
      const row = after.members.find(
        (m) => m.membershipId === target.membershipId,
      )!;

      expect(row.penaltyPoints).toBe(10.5);
      expect(row.activityPoints).toBeCloseTo(
        target.activityPoints - 10.5,
        6,
      );
      expect(row.score).toBeCloseTo(
        before - 10.5 / target.breakdown.length,
        6,
      );
    });

    it("never pushes a score below zero", async () => {
      const deductionCount = Math.ceil(target.activityPoints / 100) + 1;
      for (let i = 0; i < deductionCount; i += 1) {
        await addPenalty(t.db, admin, {
          membershipId: target.membershipId,
          points: 100,
        });
      }

      const after = await standingsNow();
      const row = after.members.find(
        (m) => m.membershipId === target.membershipId,
      )!;

      expect(row.score).toBe(0);
      expect(row.activityPoints).toBe(0);
      expect(row.penaltyPoints).toBe(deductionCount * 100);
    });

    it("leaves everybody else untouched", async () => {
      const before = await standingsNow();

      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 15,
      });

      const after = await standingsNow();
      for (const row of after.members) {
        if (row.membershipId === target.membershipId) continue;
        const was = before.members.find(
          (m) => m.membershipId === row.membershipId,
        )!;
        expect(row.score).toBeCloseTo(was.score, 6);
        expect(row.penaltyPoints).toBe(0);
      }
    });

    it("re-ranks the board once the deduction lands", async () => {
      // Enough to clear the gap to whoever is second, so the drop is a real
      // change of order rather than a change of number.
      const standings = await standingsNow();
      const gap = standings.members[0].score - standings.members[1].score;

      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: Math.max(
          1,
          Math.ceil(gap * target.breakdown.length) + 1,
        ),
      });

      const after = await standingsNow();
      const row = after.members.find(
        (m) => m.membershipId === target.membershipId,
      )!;

      expect(row.rank).toBeGreaterThan(1);
      expect(after.members[0].membershipId).not.toBe(target.membershipId);
    });
  });

  describe("teams", () => {
    it("lowers the team score by the deducted points' percentage value", async () => {
      const before = await getTeamStandings(t.db, await standingsNow());
      const wasTeam = before.find((team) => team.teamId === target.teamId)!;

      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 12,
      });

      const after = await getTeamStandings(t.db, await standingsNow());
      const team = after.find((x) => x.teamId === target.teamId)!;

      expect(team.points).toBeCloseTo(
        wasTeam.points - 12 / target.breakdown.length,
        6,
      );
      expect(team.penaltyPoints).toBe(12);
    });

    it("leaves the other teams' totals alone", async () => {
      const before = await getTeamStandings(t.db, await standingsNow());

      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 12,
      });

      const after = await getTeamStandings(t.db, await standingsNow());
      for (const team of after) {
        if (team.teamId === target.teamId) continue;
        const was = before.find((x) => x.teamId === team.teamId)!;
        expect(team.points).toBeCloseTo(was.points, 6);
        expect(team.penaltyPoints).toBe(0);
      }
    });
  });

  describe("permission", () => {
    it("refuses a Leader, even on their own team", async () => {
      await expect(
        addPenalty(t.db, coach, {
          membershipId: target.membershipId,
          points: 5,
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("refuses a locked season", async () => {
      await t.db
        .update(seasons)
        .set({ status: "locked" })
        .where(eq(seasons.id, seasonId));

      await expect(
        addPenalty(t.db, admin, {
          membershipId: target.membershipId,
          points: 5,
        }),
      ).rejects.toThrow(SeasonLockedError);
    });

    it("refuses a membership that does not exist", async () => {
      await expect(
        addPenalty(t.db, admin, { membershipId: "nope", points: 5 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("validation", () => {
    it("refuses zero and negative amounts", async () => {
      for (const points of [0, -5]) {
        await expect(
          addPenalty(t.db, admin, {
            membershipId: target.membershipId,
            points,
          }),
        ).rejects.toThrow(ConflictError);
      }
    });

    it("refuses more than one activity's maximum at once", async () => {
      await expect(
        addPenalty(t.db, admin, {
          membershipId: target.membershipId,
          points: 101,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("refuses a value that is not a number", async () => {
      await expect(
        addPenalty(t.db, admin, {
          membershipId: target.membershipId,
          points: Number.NaN,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("stores a blank reason as none rather than an empty string", async () => {
      const id = await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 3,
        reason: "   ",
      });
      const [row] = await t.db
        .select()
        .from(penalties)
        .where(eq(penalties.id, id));
      expect(row.reason).toBeNull();
    });

    it("files the deduction against the membership's own season", async () => {
      const id = await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 3,
      });
      const [row] = await t.db
        .select()
        .from(penalties)
        .where(eq(penalties.id, id));
      expect(row.seasonId).toBe(seasonId);
      expect(row.issuedBy).toBe(admin.id);
    });
  });

  describe("undoing", () => {
    it("returns exactly the points it took", async () => {
      const before = target.score;

      const id = await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 8,
      });
      await deletePenalty(t.db, admin, id);

      const after = await standingsNow();
      const row = after.members.find(
        (m) => m.membershipId === target.membershipId,
      )!;

      expect(row.score).toBeCloseTo(before, 6);
      expect(row.penaltyPoints).toBe(0);
    });

    it("leaves the other deductions in place", async () => {
      const first = await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 4,
      });
      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 6,
      });

      await deletePenalty(t.db, admin, first);

      const after = await standingsNow();
      const row = after.members.find(
        (m) => m.membershipId === target.membershipId,
      )!;
      expect(row.penaltyPoints).toBe(6);
    });

    it("refuses a Leader", async () => {
      const id = await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 4,
      });
      await expect(deletePenalty(t.db, coach, id)).rejects.toThrow(
        AuthorizationError,
      );
    });
  });

  describe("reading back", () => {
    it("lists deductions with the person, team and issuer", async () => {
      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 7,
        reason: "Late three weeks running",
      });

      const rows = await listPenalties(t.db, seasonId);
      expect(rows).toHaveLength(1);
      expect(rows[0].memberName).toBe(target.name);
      expect(rows[0].teamName).toBe(target.teamName);
      expect(rows[0].points).toBe(7);
      expect(rows[0].reason).toBe("Late three weeks running");
      expect(rows[0].issuedByName).toBe(adminName);
    });

    it("offers only scored, active members as targets", async () => {
      const targets = await listPenaltyTargets(t.db, seasonId);
      const standings = await standingsNow();

      expect(targets.map((x) => x.membershipId).sort()).toEqual(
        standings.members.map((m) => m.membershipId).sort(),
      );
    });

    it("shows the member their own deductions and what is left", async () => {
      await addPenalty(t.db, admin, {
        membershipId: target.membershipId,
        points: 9,
        reason: "Skipped the workshop",
      });

      const standings = await standingsNow();
      const detail = (await getMemberDetail(
        t.db,
        standings,
        target.membershipId,
      ))!;

      expect(detail.penalties).toHaveLength(1);
      expect(detail.penalties[0].points).toBe(9);
      expect(detail.penalties[0].reason).toBe("Skipped the workshop");
      expect(detail.penalties[0].issuedByName).toBe(adminName);
      expect(detail.standing!.baseScore - detail.standing!.score).toBeCloseTo(
        9 / target.breakdown.length,
        6,
      );
      expect(
        detail.standing!.baseActivityPoints -
          detail.standing!.activityPoints,
      ).toBeCloseTo(9, 6);
    });
  });
});
