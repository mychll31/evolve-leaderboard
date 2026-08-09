import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memberships, metricEntries, metrics, teams, users } from "@/db/schema";
import { logOwnEntry, setEntryValue } from "@/db/mutations/entries";
import { ConflictError } from "@/db/mutations/guards";
import { createMetric, setMetricActive } from "@/db/mutations/metrics";
import { setSeasonStatus } from "@/db/mutations/seasons";
import { getSelfLog } from "@/db/queries/member";
import { getActiveSeason, getStandings } from "@/db/queries/standings";
import { seed } from "@/db/seed";
import { AuthorizationError, type Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("member self-logging", () => {
  let t: TestDb;
  let seasonId: string;
  let admin: Actor;
  let coach: Actor;
  /** The signed-in member doing the logging. */
  let member: Actor;
  let membershipId: string;
  let otherMembershipId: string;
  /** A metric with no recorded value, so the member may log it. */
  let openMetricId: string;
  /** Seeded metrics all arrive coach-recorded. */
  let coachHeldMetricId: string;

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

    const teamRows = await t.db.select().from(teams);
    const founders = teamRows.find((x) => x.name === "Founders")!;
    const titans = teamRows.find((x) => x.name === "Titans")!;
    const all = await t.db.select().from(memberships);

    coach = {
      id: all.find((m) => m.teamId === founders.id && m.role === "coach")!
        .userId,
      role: "user",
    };

    const own = all.find(
      (m) =>
        m.teamId === founders.id &&
        m.role === "member" &&
        m.userId !== adminRow.id,
    )!;
    member = { id: own.userId, role: "user" };
    membershipId = own.id;
    otherMembershipId = all.find(
      (m) => m.teamId === titans.id && m.role === "member",
    )!.id;

    openMetricId = await createMetric(t.db, admin, seasonId, {
      name: "Leadership",
    });

    const [assignment] = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.key, "assignment"));
    coachHeldMetricId = assignment.id;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("logs a metric as done, worth its full share of the total", async () => {
    const season = await getActiveSeason(t.db);
    const before = await getStandings(t.db, season!, TODAY);
    const beforeScore = before.members.find(
      (m) => m.membershipId === membershipId,
    )!.score;

    await logOwnEntry(t.db, member, {
      membershipId,
      metricId: openMetricId,
      logged: true,
    });

    const after = await getStandings(t.db, season!, TODAY);
    const afterScore = after.members.find(
      (m) => m.membershipId === membershipId,
    )!.score;
    expect(afterScore).toBeGreaterThan(beforeScore);

    const [row] = await t.db
      .select()
      .from(metricEntries)
      .where(
        and(
          eq(metricEntries.membershipId, membershipId),
          eq(metricEntries.metricId, openMetricId),
        ),
      );
    // Done is a full 100 on the shared scale, not a 1 — otherwise every metric
    // logged would average to 1%.
    expect(row.value).toBe(100);
    // No approval step: it counts the moment it is saved.
    expect(row.status).toBe("approved");
    expect(row.source).toBe("self");
    expect(row.recordedBy).toBe(member.id);
  });

  it("every metric logged is 100%", async () => {
    const active = await t.db
      .select()
      .from(metrics)
      .where(and(eq(metrics.seasonId, seasonId), eq(metrics.active, true)));

    // Clear the seeded coach-recorded values so the member owns every metric.
    await t.db
      .delete(metricEntries)
      .where(eq(metricEntries.membershipId, membershipId));

    for (const metric of active) {
      await logOwnEntry(t.db, member, {
        membershipId,
        metricId: metric.id,
        logged: true,
      });
    }

    const season = await getActiveSeason(t.db);
    const standings = await getStandings(t.db, season!, TODAY);
    const scored = standings.members.find(
      (m) => m.membershipId === membershipId,
    )!;
    expect(scored.score).toBe(100);
  });

  it("counts each logged metric equally — two of three is 66.7%", async () => {
    const active = await t.db
      .select()
      .from(metrics)
      .where(and(eq(metrics.seasonId, seasonId), eq(metrics.active, true)));
    await t.db
      .delete(metricEntries)
      .where(eq(metricEntries.membershipId, membershipId));

    for (const metric of active.slice(0, active.length - 1)) {
      await logOwnEntry(t.db, member, {
        membershipId,
        metricId: metric.id,
        logged: true,
      });
    }

    const season = await getActiveSeason(t.db);
    const standings = await getStandings(t.db, season!, TODAY);
    const scored = standings.members.find(
      (m) => m.membershipId === membershipId,
    )!;
    expect(scored.score).toBeCloseTo(
      ((active.length - 1) / active.length) * 100,
      5,
    );
  });

  it("un-logging drops the metric back to zero, in the same row", async () => {
    await logOwnEntry(t.db, member, {
      membershipId,
      metricId: openMetricId,
      logged: true,
    });
    await logOwnEntry(t.db, member, {
      membershipId,
      metricId: openMetricId,
      logged: false,
    });

    const rows = await t.db
      .select()
      .from(metricEntries)
      .where(
        and(
          eq(metricEntries.membershipId, membershipId),
          eq(metricEntries.metricId, openMetricId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(0);
  });

  it("stops a member logging against someone else's membership", async () => {
    await expect(
      logOwnEntry(t.db, member, {
        membershipId: otherMembershipId,
        metricId: openMetricId,
        logged: true,
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("will not overwrite a value a Leader recorded", async () => {
    await expect(
      logOwnEntry(t.db, member, {
        membershipId,
        metricId: coachHeldMetricId,
        logged: true,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("lets a Leader correct a self-logged value, and their value wins", async () => {
    await logOwnEntry(t.db, member, {
      membershipId,
      metricId: openMetricId,
      logged: true,
    });
    await setEntryValue(t.db, coach, {
      membershipId,
      metricId: openMetricId,
      value: 60,
    });

    const [row] = await t.db
      .select()
      .from(metricEntries)
      .where(
        and(
          eq(metricEntries.membershipId, membershipId),
          eq(metricEntries.metricId, openMetricId),
        ),
      );
    expect(row.value).toBe(60);
    expect(row.source).toBe("coach");

    // And the member can no longer move it back.
    await expect(
      logOwnEntry(t.db, member, {
        membershipId,
        metricId: openMetricId,
        logged: true,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects an archived metric", async () => {
    await setMetricActive(t.db, admin, openMetricId, false);
    await expect(
      logOwnEntry(t.db, member, {
        membershipId,
        metricId: openMetricId,
        logged: true,
      }),
    ).rejects.toThrow(/no longer being tracked/);
  });

  it("refuses to write once the season is locked", async () => {
    await setSeasonStatus(t.db, admin, seasonId, "locked");
    await expect(
      logOwnEntry(t.db, member, {
        membershipId,
        metricId: openMetricId,
        logged: true,
      }),
    ).rejects.toThrow(/locked/);
  });

  describe("getSelfLog", () => {
    it("lists every active metric, marking Leader-recorded ones locked", async () => {
      await logOwnEntry(t.db, member, {
        membershipId,
        metricId: openMetricId,
        logged: true,
      });

      const rows = await getSelfLog(t.db, seasonId, membershipId);
      const own = rows.find((r) => r.metricId === openMetricId)!;
      expect(own.value).toBe(100);
      expect(own.logged).toBe(true);
      expect(own.source).toBe("self");
      expect(own.locked).toBe(false);

      const held = rows.find((r) => r.metricId === coachHeldMetricId)!;
      expect(held.locked).toBe(true);
      expect(held.recordedByName).not.toBeNull();
    });

    it("leaves an unrecorded metric empty rather than reading zero", async () => {
      const rows = await getSelfLog(t.db, seasonId, membershipId);
      const own = rows.find((r) => r.metricId === openMetricId)!;
      expect(own.value).toBeNull();
      expect(own.logged).toBe(false);
      expect(own.locked).toBe(false);
    });

    it("omits archived metrics", async () => {
      await setMetricActive(t.db, admin, openMetricId, false);
      const rows = await getSelfLog(t.db, seasonId, membershipId);
      expect(rows.some((r) => r.metricId === openMetricId)).toBe(false);
    });
  });
});
