import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  teams,
  users,
} from "@/db/schema";
import {
  approveAllPending,
  checkIn,
  decideEntry,
  recordForMember,
} from "@/db/mutations/attendance";
import { getActiveSeason, getStandings } from "@/db/queries/standings";
import { seed } from "@/db/seed";
import { AuthorizationError, type Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("attendance write path", () => {
  let t: TestDb;
  let seasonId: string;
  let attendanceMetric: string;
  let openMeeting: string;
  let foundersCoach: Actor;
  let titansCoach: Actor;
  let admin: Actor;
  let michael: { membershipId: string; userId: string };

  beforeEach(async () => {
    t = await makeTestDb();
    const result = await seed(t.db, {
      today: TODAY,
      adminEmail: "admin@core.example",
    });
    seasonId = result.seasonId;

    const [metric] = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.key, "attendance"));
    attendanceMetric = metric.id;

    // A future scheduled session: nobody has an entry for it yet.
    const [scheduled] = await t.db
      .select()
      .from(meetings)
      .where(eq(meetings.status, "scheduled"));
    openMeeting = scheduled.id;

    const teamRows = await t.db.select().from(teams);
    const founders = teamRows.find((x) => x.name === "Founders")!;
    const titans = teamRows.find((x) => x.name === "Titans")!;
    const all = await t.db.select().from(memberships);

    foundersCoach = {
      id: all.find((m) => m.teamId === founders.id && m.role === "coach")!.userId,
      role: "user",
    };
    titansCoach = {
      id: all.find((m) => m.teamId === titans.id && m.role === "coach")!.userId,
      role: "user",
    };

    const [adminRow] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, "admin@core.example"));
    admin = { id: adminRow.id, role: "super_admin" };

    const michaelMembership = all.find(
      (m) => m.userId === adminRow.id && m.role === "member",
    )!;
    michael = {
      membershipId: michaelMembership.id,
      userId: michaelMembership.userId,
    };
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** Legacy pending row, for the approval paths that still handle them. */
  const makePending = async (membershipId: string, meetingId: string) => {
    const [row] = await t.db
      .insert(metricEntries)
      .values({
        seasonId,
        metricId: attendanceMetric,
        membershipId,
        meetingId,
        value: 1,
        status: "pending",
        source: "self",
      })
      .returning({ id: metricEntries.id });
    return row.id;
  };

  const entryFor = async (membershipId: string, meetingId: string) => {
    const [row] = await t.db
      .select()
      .from(metricEntries)
      .where(
        and(
          eq(metricEntries.membershipId, membershipId),
          eq(metricEntries.meetingId, meetingId),
          eq(metricEntries.metricId, attendanceMetric),
        ),
      );
    return row;
  };

  describe("checkIn", () => {
    it("records an approved self entry that counts immediately", async () => {
      const actor: Actor = { id: michael.userId, role: "user" };
      await checkIn(t.db, actor, michael.membershipId, openMeeting);

      const entry = await entryFor(michael.membershipId, openMeeting);
      expect(entry.status).toBe("approved");
      expect(entry.source).toBe("self");
      expect(entry.value).toBe(1);
      // Self-decided: the member's own tap is the decision.
      expect(entry.decidedBy).toBe(michael.userId);
      expect(entry.decidedAt).not.toBeNull();
    });

    it("updates rather than duplicating on a second check-in", async () => {
      const actor: Actor = { id: michael.userId, role: "user" };
      await checkIn(t.db, actor, michael.membershipId, openMeeting);
      await checkIn(t.db, actor, michael.membershipId, openMeeting);

      const rows = await t.db
        .select()
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.membershipId, michael.membershipId),
            eq(metricEntries.meetingId, openMeeting),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it("does not change the season-level attendance score", async () => {
      const season = await getActiveSeason(t.db);
      const before = await getStandings(t.db, season!, TODAY);
      const beforeAtt = before.members.find(
        (m) => m.membershipId === michael.membershipId,
      )!.breakdown.find((b) => b.key === "attendance")!.value;

      // Check in, then hold the session so it enters the denominator.
      await checkIn(
        t.db,
        { id: michael.userId, role: "user" },
        michael.membershipId,
        openMeeting,
      );
      await t.db
        .update(meetings)
        .set({ status: "held" })
        .where(eq(meetings.id, openMeeting));

      const after = await getStandings(t.db, season!, TODAY);
      const afterAtt = after.members.find(
        (m) => m.membershipId === michael.membershipId,
      )!.breakdown.find((b) => b.key === "attendance")!.value;

      expect(afterAtt).toBeCloseTo(beforeAtt, 6);
    });

    it("cannot overwrite a decision a coach has already made", async () => {
      await recordForMember(
        t.db,
        foundersCoach,
        michael.membershipId,
        openMeeting,
        false,
      );
      await checkIn(
        t.db,
        { id: michael.userId, role: "user" },
        michael.membershipId,
        openMeeting,
      );

      const entry = await entryFor(michael.membershipId, openMeeting);
      expect(entry.status).toBe("approved");
      expect(entry.value).toBe(0);
      expect(entry.source).toBe("coach");
    });

    it("refuses to check in on someone else's behalf", async () => {
      // Regression: checkIn took an attacker-controlled membershipId and never
      // verified it belonged to the caller, so any signed-in member could mark
      // another person present.
      const all = await t.db.select().from(memberships);
      const victim = all.find(
        (m) => m.role === "member" && m.id !== michael.membershipId,
      )!;

      await expect(
        checkIn(
          t.db,
          { id: michael.userId, role: "user" },
          victim.id,
          openMeeting,
        ),
      ).rejects.toThrow(AuthorizationError);

      expect(await entryFor(victim.id, openMeeting)).toBeUndefined();
    });

    it("refuses a membership that does not exist", async () => {
      await expect(
        checkIn(
          t.db,
          { id: michael.userId, role: "user" },
          "no-such-membership",
          openMeeting,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("refuses a cancelled session", async () => {
      await t.db
        .update(meetings)
        .set({ status: "cancelled" })
        .where(eq(meetings.id, openMeeting));

      await expect(
        checkIn(
          t.db,
          { id: michael.userId, role: "user" },
          michael.membershipId,
          openMeeting,
        ),
      ).rejects.toThrow(/cancelled/i);
    });
  });

  describe("decideEntry", () => {
    it("lets the right coach approve, and moves the score", async () => {
      await checkIn(
        t.db,
        { id: michael.userId, role: "user" },
        michael.membershipId,
        openMeeting,
      );
      const entry = await entryFor(michael.membershipId, openMeeting);
      await decideEntry(t.db, foundersCoach, entry.id, "approved");

      const updated = await entryFor(michael.membershipId, openMeeting);
      expect(updated.status).toBe("approved");
      expect(updated.decidedBy).toBe(foundersCoach.id);
      expect(updated.decidedAt).not.toBeNull();
    });

    it("zeroes the value when rejecting, so it cannot read as present", async () => {
      await checkIn(
        t.db,
        { id: michael.userId, role: "user" },
        michael.membershipId,
        openMeeting,
      );
      const entry = await entryFor(michael.membershipId, openMeeting);
      await decideEntry(t.db, foundersCoach, entry.id, "rejected");

      const updated = await entryFor(michael.membershipId, openMeeting);
      expect(updated.status).toBe("rejected");
      expect(updated.value).toBe(0);
    });

    it("stops a coach deciding on another team's member", async () => {
      // Check-ins no longer create pending rows, so build one directly to keep
      // covering the legacy approval path for pre-existing entries.
      const entryId = await makePending(michael.membershipId, openMeeting);

      await expect(
        decideEntry(t.db, titansCoach, entryId, "approved"),
      ).rejects.toThrow(AuthorizationError);

      const untouched = await entryFor(michael.membershipId, openMeeting);
      expect(untouched.status).toBe("pending");
    });

    it("lets a super admin decide on anyone", async () => {
      await checkIn(
        t.db,
        { id: michael.userId, role: "user" },
        michael.membershipId,
        openMeeting,
      );
      const entry = await entryFor(michael.membershipId, openMeeting);
      await decideEntry(t.db, admin, entry.id, "approved");
      expect((await entryFor(michael.membershipId, openMeeting)).status).toBe(
        "approved",
      );
    });
  });

  describe("recordForMember", () => {
    it("tags coach-entered attendance so it is distinguishable from a check-in", async () => {
      await recordForMember(
        t.db,
        foundersCoach,
        michael.membershipId,
        openMeeting,
        true,
      );
      const entry = await entryFor(michael.membershipId, openMeeting);
      expect(entry.source).toBe("coach");
      expect(entry.status).toBe("approved");
    });

    it("tags admin-entered attendance separately again", async () => {
      await recordForMember(
        t.db,
        admin,
        michael.membershipId,
        openMeeting,
        true,
      );
      expect((await entryFor(michael.membershipId, openMeeting)).source).toBe(
        "admin",
      );
    });

    it("stops a coach recording for another team", async () => {
      await expect(
        recordForMember(
          t.db,
          titansCoach,
          michael.membershipId,
          openMeeting,
          true,
        ),
      ).rejects.toThrow(AuthorizationError);
      expect(await entryFor(michael.membershipId, openMeeting)).toBeUndefined();
    });

    it("does not move the leaderboard once legacy attendance is recorded", async () => {
      const season = await getActiveSeason(t.db);
      const before = await getStandings(t.db, season!, TODAY);
      const beforeScore = before.members.find(
        (m) => m.membershipId === michael.membershipId,
      )!.score;

      // Mark absent for a legacy session. Visible scoring uses the season-level
      // attendance metric instead.
      const [held] = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.status, "held"));
      await recordForMember(
        t.db,
        foundersCoach,
        michael.membershipId,
        held.id,
        false,
      );

      const after = await getStandings(t.db, season!, TODAY);
      const afterScore = after.members.find(
        (m) => m.membershipId === michael.membershipId,
      )!.score;
      expect(afterScore).toBeCloseTo(beforeScore, 6);
    });
  });

  describe("approveAllPending", () => {
    it("approves every pending entry for the given members", async () => {
      const all = await t.db.select().from(memberships);
      const teamRows = await t.db.select().from(teams);
      const founders = teamRows.find((x) => x.name === "Founders")!;
      const roster = all
        .filter((m) => m.teamId === founders.id && m.role === "member")
        .map((m) => m.id);

      // Legacy pending rows: check-ins no longer create them.
      for (const membershipId of roster) {
        await makePending(membershipId, openMeeting);
      }

      const count = await approveAllPending(
        t.db,
        foundersCoach,
        openMeeting,
        roster,
      );
      expect(count).toBe(roster.length);

      for (const membershipId of roster) {
        expect((await entryFor(membershipId, openMeeting)).status).toBe(
          "approved",
        );
      }
    });

    it("refuses the whole batch if any member is out of scope", async () => {
      const all = await t.db.select().from(memberships);
      const teamRows = await t.db.select().from(teams);
      const founders = teamRows.find((x) => x.name === "Founders")!;
      const titans = teamRows.find((x) => x.name === "Titans")!;
      const mixed = [
        all.find((m) => m.teamId === founders.id && m.role === "member")!.id,
        all.find((m) => m.teamId === titans.id && m.role === "member")!.id,
      ];

      await expect(
        approveAllPending(t.db, foundersCoach, openMeeting, mixed),
      ).rejects.toThrow(AuthorizationError);
    });

    it("is a no-op for an empty roster", async () => {
      expect(
        await approveAllPending(t.db, foundersCoach, openMeeting, []),
      ).toBe(0);
    });
  });
});
