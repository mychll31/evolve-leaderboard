import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memberships, metricEntries, metrics, teams, users } from "@/db/schema";
import { logOwnEntry } from "@/db/mutations/entries";
import { setSeasonStatus } from "@/db/mutations/seasons";
import { getSelfLog } from "@/db/queries/member";
import { getActiveSeason, getStandings } from "@/db/queries/standings";
import { seed } from "@/db/seed";
import {
  PHASE1_CHECKLIST,
  PHASE1_ITEMS,
  SeasonNotWritableError,
  planPhase1Metrics,
  seedPhase1Metrics,
} from "@/db/seed-phase1";
import type { Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("Phase 1 checklist seeder", () => {
  let t: TestDb;
  let seasonId: string;
  let admin: Actor;
  let member: Actor;
  let membershipId: string;

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
    const own = (await t.db.select().from(memberships)).find(
      (m) =>
        m.teamId === founders.id &&
        m.role === "member" &&
        m.userId !== adminRow.id,
    )!;
    member = { id: own.userId, role: "user" };
    membershipId = own.id;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("has every checklist item exactly once, with unique keys", () => {
    const keys = PHASE1_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PHASE1_ITEMS).toHaveLength(28);
    expect(PHASE1_CHECKLIST.map((s) => s.items.length)).toEqual([
      2, 5, 5, 5, 6, 5,
    ]);
  });

  it("creates the checklist in checklist order", async () => {
    await seedPhase1Metrics(t.db, seasonId);

    const rows = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.seasonId, seasonId))
      .orderBy(metrics.sortOrder);

    const seeded = rows.filter((r) => r.key.startsWith("p1-"));
    expect(seeded.map((r) => r.key)).toEqual(PHASE1_ITEMS.map((i) => i.key));
    expect(seeded.every((r) => r.active)).toBe(true);
    // The exams sit at the end of Phase 1, not under a weekly session.
    expect(seeded.at(-1)!.key).toBe("p1-exam-5");
  });

  it("is safe to run twice", async () => {
    await seedPhase1Metrics(t.db, seasonId);
    const second = await seedPhase1Metrics(t.db, seasonId);

    expect(second.created).toHaveLength(0);
    expect(second.updated).toHaveLength(0);
    expect(second.unchanged).toHaveLength(PHASE1_ITEMS.length);

    const rows = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.seasonId, seasonId));
    expect(rows.filter((r) => r.key.startsWith("p1-"))).toHaveLength(
      PHASE1_ITEMS.length,
    );
  });

  it("corrects a renamed, reordered or archived item without losing its entries", async () => {
    await seedPhase1Metrics(t.db, seasonId);

    const [item] = await t.db
      .select()
      .from(metrics)
      .where(
        and(eq(metrics.seasonId, seasonId), eq(metrics.key, "p1-w1-session")),
      );

    await logOwnEntry(t.db, member, {
      membershipId,
      metricId: item.id,
      logged: true,
    });

    await t.db
      .update(metrics)
      .set({ name: "Typo", sortOrder: 99, active: false })
      .where(eq(metrics.id, item.id));

    const plan = await seedPhase1Metrics(t.db, seasonId);
    expect(plan.updated.map((i) => i.key)).toContain("p1-w1-session");

    const [fixed] = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.id, item.id));
    expect(fixed.name).toBe("Week 1 · Attend the August 7 Phase 1 session");
    expect(fixed.active).toBe(true);
    expect(fixed.sortOrder).toBe(2);

    // Same row, so the student's tick survives.
    const [entry] = await t.db
      .select()
      .from(metricEntries)
      .where(eq(metricEntries.metricId, item.id));
    expect(entry.value).toBe(100);
  });

  it("leaves other metrics alone unless asked to archive them", async () => {
    const plan = await seedPhase1Metrics(t.db, seasonId);
    expect(plan.others.map((o) => o.key).sort()).toEqual([
      "assignment",
      "attendance",
      "quiz",
    ]);

    const stillActive = await t.db
      .select()
      .from(metrics)
      .where(and(eq(metrics.seasonId, seasonId), eq(metrics.key, "quiz")));
    expect(stillActive[0].active).toBe(true);

    await seedPhase1Metrics(t.db, seasonId, { archiveOthers: true });
    const archived = await t.db
      .select()
      .from(metrics)
      .where(and(eq(metrics.seasonId, seasonId), eq(metrics.key, "quiz")));
    expect(archived[0].active).toBe(false);
  });

  it("refuses to write to a locked season", async () => {
    await setSeasonStatus(t.db, admin, seasonId, "locked");
    await expect(seedPhase1Metrics(t.db, seasonId)).rejects.toThrow(
      SeasonNotWritableError,
    );
  });

  it("plans without writing", async () => {
    const plan = await planPhase1Metrics(t.db, seasonId);
    expect(plan.created).toHaveLength(PHASE1_ITEMS.length);

    const rows = await t.db
      .select()
      .from(metrics)
      .where(eq(metrics.seasonId, seasonId));
    expect(rows.some((r) => r.key.startsWith("p1-"))).toBe(false);
  });

  it("scores a student by how much of the checklist they have ticked", async () => {
    await seedPhase1Metrics(t.db, seasonId, { archiveOthers: true });

    // Clear the demo data so this student owns every metric on the board.
    await t.db
      .delete(metricEntries)
      .where(eq(metricEntries.membershipId, membershipId));

    const rows = await getSelfLog(t.db, seasonId, membershipId);
    expect(rows).toHaveLength(PHASE1_ITEMS.length);

    const half = rows.slice(0, 14);
    for (const row of half) {
      await logOwnEntry(t.db, member, {
        membershipId,
        metricId: row.metricId,
        logged: true,
      });
    }

    const season = await getActiveSeason(t.db);
    const standings = await getStandings(t.db, season!, TODAY);
    const scored = standings.members.find(
      (m) => m.membershipId === membershipId,
    )!;
    expect(scored.score).toBeCloseTo(50, 5);
  });
});
