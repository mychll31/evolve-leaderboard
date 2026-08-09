import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memberships, metricEntries, teams, users } from "@/db/schema";
import { logOwnEntry } from "@/db/mutations/entries";
import { getActiveSeason, getStandings } from "@/db/queries/standings";
import { getSeasonReport } from "@/db/queries/teams";
import { seed } from "@/db/seed";
import { seedPhase1Metrics } from "@/db/seed-phase1";
import type { Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("season report — who is done and who is not", () => {
  let t: TestDb;
  let seasonId: string;
  let foundersId: string;
  let buildersId: string;

  const standings = async () => {
    const season = await getActiveSeason(t.db);
    return getStandings(t.db, season!, TODAY);
  };

  const actorFor = async (membershipId: string): Promise<Actor> => {
    const [row] = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.id, membershipId));
    return { id: row.userId, role: "user" };
  };

  beforeEach(async () => {
    t = await makeTestDb();
    const result = await seed(t.db, {
      today: TODAY,
      adminEmail: "admin@core.example",
    });
    seasonId = result.seasonId;

    const teamRows = await t.db.select().from(teams);
    foundersId = teamRows.find((x) => x.name === "Founders")!.id;
    buildersId = teamRows.find((x) => x.name === "Builders")!.id;

    await seedPhase1Metrics(t.db, seasonId, { archiveOthers: true });
    await t.db.delete(metricEntries);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("covers everyone when the scope is every team", async () => {
    const report = await getSeasonReport(t.db, await standings(), null);

    expect(report.total).toBe(28);
    expect(report.members.length).toBeGreaterThan(5);
    expect(report.teams.length).toBeGreaterThan(1);
    expect(report.finished).toHaveLength(0);
    expect(report.outstanding).toHaveLength(report.members.length);
    // Nothing done yet, so everything is still on everyone's list.
    expect(report.outstanding[0].missing).toHaveLength(28);
  });

  it("covers only the given teams for a member", async () => {
    const report = await getSeasonReport(t.db, await standings(), [foundersId]);

    expect(report.teams).toHaveLength(1);
    expect(report.teams[0].teamId).toBe(foundersId);
    expect(report.members.every((m) => m.teamId === foundersId)).toBe(true);

    const everyone = await getSeasonReport(t.db, await standings(), null);
    expect(report.members.length).toBeLessThan(everyone.members.length);
  });

  it("moves a person from outstanding to finished as they work through the list", async () => {
    const before = await getSeasonReport(t.db, await standings(), [foundersId]);
    const target = before.members[0];
    const actor = await actorFor(target.membershipId);
    const season = await standings();

    // Halfway: still outstanding, with the right number left.
    for (const metric of season.metrics.slice(0, 14)) {
      await logOwnEntry(t.db, actor, {
        membershipId: target.membershipId,
        metricId: metric.id,
        logged: true,
      });
    }

    let report = await getSeasonReport(t.db, await standings(), [foundersId]);
    let row = report.members.find(
      (m) => m.membershipId === target.membershipId,
    )!;
    expect(row.doneCount).toBe(14);
    expect(row.missing).toHaveLength(14);
    expect(report.finished.map((m) => m.membershipId)).not.toContain(
      target.membershipId,
    );

    // The rest: now finished, with nothing left.
    for (const metric of season.metrics.slice(14)) {
      await logOwnEntry(t.db, actor, {
        membershipId: target.membershipId,
        metricId: metric.id,
        logged: true,
      });
    }

    report = await getSeasonReport(t.db, await standings(), [foundersId]);
    row = report.members.find((m) => m.membershipId === target.membershipId)!;
    expect(row.doneCount).toBe(28);
    expect(row.missing).toHaveLength(0);
    expect(report.finished.map((m) => m.membershipId)).toContain(
      target.membershipId,
    );
    expect(report.teams[0].finished).toBe(1);
  });

  it("names what is still outstanding, in checklist order", async () => {
    const season = await standings();
    const report = await getSeasonReport(t.db, season, [foundersId]);
    const target = report.members[0];
    const actor = await actorFor(target.membershipId);

    await logOwnEntry(t.db, actor, {
      membershipId: target.membershipId,
      metricId: season.metrics[0].id,
      logged: true,
    });

    const after = await getSeasonReport(t.db, await standings(), [foundersId]);
    const row = after.members.find(
      (m) => m.membershipId === target.membershipId,
    )!;

    expect(row.missing).not.toContain(season.metrics[0].name);
    expect(row.missing[0]).toBe(season.metrics[1].name);
  });

  it("can limit the report to selected metrics", async () => {
    const season = await standings();
    const [firstMetric, secondMetric] = season.metrics;
    const report = await getSeasonReport(t.db, season, [foundersId], [
      firstMetric.id,
      secondMetric.id,
    ]);
    const target = report.members[0];
    const actor = await actorFor(target.membershipId);

    expect(report.total).toBe(2);
    expect(report.metrics.map((m) => m.metricId)).toEqual([
      firstMetric.id,
      secondMetric.id,
    ]);
    expect(target.missingMetricIds).toEqual([firstMetric.id, secondMetric.id]);

    await logOwnEntry(t.db, actor, {
      membershipId: target.membershipId,
      metricId: firstMetric.id,
      logged: true,
    });

    const after = await getSeasonReport(t.db, await standings(), [foundersId], [
      firstMetric.id,
      secondMetric.id,
    ]);
    const row = after.members.find(
      (member) => member.membershipId === target.membershipId,
    )!;

    expect(row.doneCount).toBe(1);
    expect(row.doneMetricIds).toEqual([firstMetric.id]);
    expect(row.missingMetricIds).toEqual([secondMetric.id]);
  });

  it("sorts the outstanding list least done first", async () => {
    const season = await standings();
    const report = await getSeasonReport(t.db, season, [foundersId]);
    const [first, second] = report.members;

    const actor = await actorFor(first.membershipId);
    for (const metric of season.metrics.slice(0, 5)) {
      await logOwnEntry(t.db, actor, {
        membershipId: first.membershipId,
        metricId: metric.id,
        logged: true,
      });
    }

    const after = await getSeasonReport(t.db, await standings(), [foundersId]);
    const order = after.outstanding.map((m) => m.membershipId);
    expect(order.indexOf(second.membershipId)).toBeLessThan(
      order.indexOf(first.membershipId),
    );
  });

  it("keeps one team's work out of another's", async () => {
    const season = await standings();
    const founders = await getSeasonReport(t.db, season, [foundersId]);
    const target = founders.members[0];
    const actor = await actorFor(target.membershipId);

    for (const metric of season.metrics) {
      await logOwnEntry(t.db, actor, {
        membershipId: target.membershipId,
        metricId: metric.id,
        logged: true,
      });
    }

    const builders = await getSeasonReport(t.db, await standings(), [
      buildersId,
    ]);
    expect(builders.finished).toHaveLength(0);
    expect(
      builders.members.every((m) => m.doneCount === 0 && m.missing.length === 28),
    ).toBe(true);
  });
});
