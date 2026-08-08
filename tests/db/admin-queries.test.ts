import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberships, teams, users } from "@/db/schema";
import { listMeetings, listMetrics, listPeople, listSeasons, listTeams } from "@/db/queries/admin";
import { getMemberDetail } from "@/db/queries/member";
import { getActiveSeason, getStandings, type Standings } from "@/db/queries/standings";
import { seed } from "@/db/seed";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("admin + member queries", () => {
  let t: TestDb;
  let seasonId: string;
  let standings: Standings;

  beforeAll(async () => {
    t = await makeTestDb();
    const r = await seed(t.db, { today: TODAY, adminEmail: "admin@core.example" });
    seasonId = r.seasonId;
    const season = await getActiveSeason(t.db);
    standings = await getStandings(t.db, season!, TODAY);
  });
  afterAll(async () => { await t.cleanup(); });

  it("summarises seasons with counts", async () => {
    const rows = await listSeasons(t.db);
    // The active season plus the archived preseason the fixture seeds for
    // cross-season Hall of Fame history.
    expect(rows).toHaveLength(2);

    const active = rows.find((r) => r.status === "active")!;
    expect(active).toMatchObject({ teamCount: 10, memberCount: 14 });
    expect(active.meetingCount).toBeGreaterThan(15);

    const archived = rows.find((r) => r.status === "archived")!;
    expect(archived.name).toBe("Leaderboard Preseason");
    expect(archived.meetingCount).toBe(0);
  });

  it("lists meetings with attendance counts", async () => {
    const rows = await listMeetings(t.db, seasonId);
    const held = rows.filter((r) => r.status === "held");
    expect(held).toHaveLength(15);
    expect(held.every((r) => r.entryCount > 0)).toBe(true);
    expect(rows.filter((r) => r.status === "scheduled").every((r) => r.entryCount === 0)).toBe(true);
  });

  it("lists teams with coach and member counts", async () => {
    const rows = await listTeams(t.db, seasonId);
    expect(rows).toHaveLength(10);
    const founders = rows.find((r) => r.name === "Founders")!;
    expect(founders.coachName).toBe("John Doe");
    expect(founders.memberCount).toBe(2);
  });

  it("lists everyone including users with no membership", async () => {
    await t.db.insert(users).values({ name: "Unassigned", email: "un@core.example" });
    const rows = await listPeople(t.db, seasonId);
    const un = rows.find((r) => r.email === "un@core.example")!;
    expect(un.membershipId).toBeNull();
    expect(un.teamName).toBeNull();
    expect(rows.filter((r) => r.membershipId !== null).length).toBe(24);
  });

  it("flags which metrics have entries so type edits can lock", async () => {
    const rows = await listMetrics(t.db, seasonId);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.hasEntries)).toBe(true);
  });

  it("builds member detail with metric audit trail", async () => {
    const [founders] = await t.db.select().from(teams).where(eq(teams.name, "Founders"));
    const all = await t.db.select().from(memberships);
    const m = all.find((x) => x.teamId === founders.id && x.role === "member")!;

    const detail = await getMemberDetail(t.db, standings, m.id);
    expect(detail).not.toBeNull();
    expect(detail!.seasonMetrics.map((s) => s.key)).toEqual([
      "attendance",
      "assignment",
      "quiz",
    ]);
    expect(detail!.seasonMetrics.every((s) => s.entry !== null)).toBe(true);
    expect(detail!.standing).not.toBeNull();

    const recorded = detail!.seasonMetrics.map((m) => m.entry!);
    expect(recorded.every((entry) => entry.recordedAt instanceof Date)).toBe(true);
    expect(recorded.every((entry) => entry.source === "coach")).toBe(true);
  });

  it("returns null for an unknown membership", async () => {
    expect(await getMemberDetail(t.db, standings, "nope")).toBeNull();
  });
});
