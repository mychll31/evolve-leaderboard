import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memberships, metricEntries, metrics, teams, users } from "@/db/schema";
import { logOwnEntry } from "@/db/mutations/entries";
import { setMetricActive } from "@/db/mutations/metrics";
import { getActiveSeason, getStandings } from "@/db/queries/standings";
import { getTeamRoster } from "@/db/queries/teams";
import { seed } from "@/db/seed";
import { seedPhase1Metrics } from "@/db/seed-phase1";
import type { Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("team roster — who has logged what", () => {
  let t: TestDb;
  let seasonId: string;
  let admin: Actor;
  let foundersId: string;

  const standings = async () => {
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

    const [founders] = await t.db
      .select()
      .from(teams)
      .where(eq(teams.name, "Founders"));
    foundersId = founders.id;

    // A clean board: the Phase 1 checklist only, nothing logged.
    await seedPhase1Metrics(t.db, seasonId, { archiveOthers: true });
    await t.db.delete(metricEntries);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("lists the team with nothing logged", async () => {
    const roster = await getTeamRoster(t.db, await standings(), foundersId);

    expect(roster).not.toBeNull();
    expect(roster!.name).toBe("Founders");
    expect(roster!.coachName).toBe("John Doe");
    expect(roster!.members.length).toBeGreaterThan(0);
    expect(roster!.members.every((m) => m.loggedCount === 0)).toBe(true);
    expect(roster!.coverage.every((c) => c.logged === 0)).toBe(true);
    expect(roster!.complete).toBe(false);
  });

  it("counts a member's logged items and leaves teammates untouched", async () => {
    const before = await getTeamRoster(t.db, await standings(), foundersId);
    const [target, ...others] = before!.members;

    const [membership] = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.id, target.membershipId));
    const member: Actor = { id: membership.userId, role: "user" };

    const first = before!.metrics.slice(0, 3);
    for (const metric of first) {
      await logOwnEntry(t.db, member, {
        membershipId: target.membershipId,
        metricId: metric.metricId,
        logged: true,
      });
    }

    const after = await getTeamRoster(t.db, await standings(), foundersId);
    const updated = after!.members.find(
      (m) => m.membershipId === target.membershipId,
    )!;

    expect(updated.loggedCount).toBe(3);
    expect(updated.loggedMetricIds.sort()).toEqual(
      first.map((m) => m.metricId).sort(),
    );
    for (const other of others) {
      const row = after!.members.find(
        (m) => m.membershipId === other.membershipId,
      )!;
      expect(row.loggedCount).toBe(0);
    }

    // Coverage counts the team, item by item.
    const covered = after!.coverage.find(
      (c) => c.metricId === first[0].metricId,
    )!;
    expect(covered.logged).toBe(1);
  });

  it("does not count an un-logged item", async () => {
    const roster = await getTeamRoster(t.db, await standings(), foundersId);
    const target = roster!.members[0];
    const metric = roster!.metrics[0];

    const [membership] = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.id, target.membershipId));
    const member: Actor = { id: membership.userId, role: "user" };

    await logOwnEntry(t.db, member, {
      membershipId: target.membershipId,
      metricId: metric.metricId,
      logged: true,
    });
    await logOwnEntry(t.db, member, {
      membershipId: target.membershipId,
      metricId: metric.metricId,
      logged: false,
    });

    const after = await getTeamRoster(t.db, await standings(), foundersId);
    const updated = after!.members.find(
      (m) => m.membershipId === target.membershipId,
    )!;
    expect(updated.loggedCount).toBe(0);
  });

  it("ignores archived metrics", async () => {
    const roster = await getTeamRoster(t.db, await standings(), foundersId);
    const total = roster!.metrics.length;

    const [archived] = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.key, "p1-exam-5"));
    await setMetricActive(t.db, admin, archived.id, false);

    const after = await getTeamRoster(t.db, await standings(), foundersId);
    expect(after!.metrics).toHaveLength(total - 1);
    expect(after!.metrics.some((m) => m.key === "p1-exam-5")).toBe(false);
  });

  it("reports complete once every member has logged every metric", async () => {
    const roster = await getTeamRoster(t.db, await standings(), foundersId);

    for (const target of roster!.members) {
      const [membership] = await t.db
        .select()
        .from(memberships)
        .where(eq(memberships.id, target.membershipId));
      const member: Actor = { id: membership.userId, role: "user" };
      for (const metric of roster!.metrics) {
        await logOwnEntry(t.db, member, {
          membershipId: target.membershipId,
          metricId: metric.metricId,
          logged: true,
        });
      }
    }

    const after = await getTeamRoster(t.db, await standings(), foundersId);
    expect(after!.complete).toBe(true);
    expect(
      after!.coverage.every((c) => c.logged === after!.members.length),
    ).toBe(true);
    expect(after!.members.every((m) => m.score === 100)).toBe(true);
  });

  it("returns null for a team that is not in this season", async () => {
    const roster = await getTeamRoster(
      t.db,
      await standings(),
      "not-a-real-team",
    );
    expect(roster).toBeNull();
  });
});
