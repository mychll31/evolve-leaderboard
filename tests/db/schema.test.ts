import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  seasons,
  teams,
  users,
} from "@/db/schema";
import { makeTestDb, type TestDb } from "../helpers/db";

describe("schema", () => {
  let t: TestDb;
  let seasonId: string;
  let teamId: string;
  let userId: string;

  beforeAll(async () => {
    t = await makeTestDb();

    [{ id: seasonId }] = await t.db
      .insert(seasons)
      .values({
        name: "Core+ Season 1",
        startsOn: "2026-08-01",
        endsOn: "2026-09-30",
        status: "active",
        formula: "weighted",
      })
      .returning({ id: seasons.id });

    [{ id: teamId }] = await t.db
      .insert(teams)
      .values({ seasonId, name: "Founders", abbr: "FDR", color: "#12B5CB" })
      .returning({ id: teams.id });

    [{ id: userId }] = await t.db
      .insert(users)
      .values({ name: "Michael", email: "michael@example.com" })
      .returning({ id: users.id });
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it("defaults a new user to the non-admin global role", async () => {
    const [row] = await t.db.select().from(users).limit(1);
    expect(row.role).toBe("user");
  });

  it("allows one membership per person per season", async () => {
    const [row] = await t.db
      .insert(memberships)
      .values({ seasonId, teamId, userId, role: "member", position: "PG" })
      .returning({ id: memberships.id });
    expect(row.id).toBeTruthy();
  });

  it("rejects a second team place for the same person in the same season", async () => {
    const [other] = await t.db
      .insert(teams)
      .values({ seasonId, name: "Titans", abbr: "TTN", color: "#475569" })
      .returning({ id: teams.id });

    await expect(
      t.db
        .insert(memberships)
        .values({ seasonId, teamId: other.id, userId, role: "member" }),
    ).rejects.toThrow();
  });

  it("rejects duplicate entries for the same member, metric and meeting", async () => {
    const [membership] = await t.db
      .select()
      .from(memberships)
      .limit(1);
    const [metric] = await t.db
      .insert(metrics)
      .values({
        seasonId,
        key: "attendance",
        name: "Attendance",
        type: "percentage",
        weight: 40,
        required: true,
      })
      .returning({ id: metrics.id });
    const [meeting] = await t.db
      .insert(meetings)
      .values({
        seasonId,
        meetsOn: "2026-08-03",
        startsAt: new Date("2026-08-03T09:00:00Z"),
        lateAfterMinutes: 5,
        status: "held",
      })
      .returning({ id: meetings.id });

    const row = {
      seasonId,
      metricId: metric.id,
      membershipId: membership.id,
      meetingId: meeting.id,
      value: 1,
    };

    await t.db.insert(metricEntries).values(row);
    await expect(t.db.insert(metricEntries).values(row)).rejects.toThrow();
  });

  it("rejects duplicate season-level entries, where meetingId is null", async () => {
    // SQLite treats NULLs as distinct in a unique index, so this case is only
    // covered by the partial index — without it the second insert succeeds.
    const [membership] = await t.db.select().from(memberships).limit(1);
    const [metric] = await t.db
      .insert(metrics)
      .values({
        seasonId,
        key: "assignment",
        name: "Assignment",
        type: "integer",
        weight: 40,
        target: 8,
      })
      .returning({ id: metrics.id });

    const row = {
      seasonId,
      metricId: metric.id,
      membershipId: membership.id,
      meetingId: null,
      value: 7,
    };

    await t.db.insert(metricEntries).values(row);
    await expect(t.db.insert(metricEntries).values(row)).rejects.toThrow();
  });
});
