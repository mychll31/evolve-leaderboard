import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { metrics, seasons } from "@/db/schema";

/**
 * The E-VOLVE Phase 1 student checklist, as metrics.
 *
 * Every item is one metric, and every active metric counts equally toward the
 * total — so a student who has ticked 14 of these 28 is at 50%.
 *
 * There is no group column on `metric`, so the section is carried in the name
 * ("Week 1 · …"). Ordering is `sortOrder`, which follows this array, so the
 * dashboard reads top to bottom in the same order as the printed checklist:
 * getting started, the four weeks in date order, then the exams at the end.
 *
 * Keys are stable and prefixed `p1-`. They are what makes this seeder safe to
 * re-run: an item is matched by key, so a second run updates wording and order
 * rather than creating a duplicate set.
 */

export type Phase1Item = {
  /** Stable slug — never change one after a season has data against it. */
  key: string;
  name: string;
};

export type Phase1Section = {
  title: string;
  items: Phase1Item[];
};

export const PHASE1_CHECKLIST: Phase1Section[] = [
  {
    title: "Getting started",
    items: [
      {
        key: "p1-setup-dingtalk",
        name: "Getting started · Download and activate DingTalk",
      },
      {
        key: "p1-setup-platform",
        name: "Getting started · Access the E-VOLVE learning platform",
      },
    ],
  },
  {
    title: "Week 1 — August 7",
    items: [
      {
        key: "p1-w1-session",
        name: "Week 1 · Attend the August 7 Phase 1 session",
      },
      {
        key: "p1-w1-road-102",
        name: "Week 1 · Road to 102 — Mission, Vision and Values in the Context of AI",
      },
      {
        key: "p1-w1-reading",
        name: "Week 1 · Supplementary reading for Session 1",
      },
      {
        key: "p1-w1-reflection",
        name: "Week 1 · Submit learning/reflection through DingTalk",
      },
      {
        key: "p1-w1-feedback",
        name: "Week 1 · Answer the August 7 feedback form",
      },
    ],
  },
  {
    title: "Week 2 — August 14",
    items: [
      {
        key: "p1-w2-session",
        name: "Week 2 · Attend the August 14 Phase 1 session",
      },
      {
        key: "p1-w2-road-102",
        name: "Week 2 · Road to 102 — Strategy Formulation in the AI Age",
      },
      {
        key: "p1-w2-reading",
        name: "Week 2 · Supplementary reading for Session 2",
      },
      {
        key: "p1-w2-reflection",
        name: "Week 2 · Submit learning/reflection through DingTalk",
      },
      {
        key: "p1-w2-feedback",
        name: "Week 2 · Answer the August 14 feedback form",
      },
    ],
  },
  {
    title: "Week 3 — August 21",
    items: [
      {
        key: "p1-w3-session",
        name: "Week 3 · Attend the August 21 Phase 1 session",
      },
      {
        key: "p1-w3-road-102",
        name: "Week 3 · Road to 102 — Organization & People",
      },
      {
        key: "p1-w3-reading",
        name: "Week 3 · Supplementary reading for Session 3",
      },
      {
        key: "p1-w3-reflection",
        name: "Week 3 · Submit learning/reflection through DingTalk",
      },
      {
        key: "p1-w3-feedback",
        name: "Week 3 · Answer the August 21 feedback form",
      },
    ],
  },
  {
    title: "Week 4 — August 28",
    items: [
      {
        key: "p1-w4-session",
        name: "Week 4 · Attend the August 28 Phase 1 session",
      },
      { key: "p1-w4-ai-marketing", name: "Week 4 · Complete AI for Marketing" },
      {
        // Alibaba material, filed under Week 4 so the student view stays
        // chronological rather than gaining a section of its own.
        key: "p1-w4-rest-brand",
        name: "Week 4 · How REST Built a Borderless Brand From Scratch?",
      },
      {
        key: "p1-w4-reading",
        name: "Week 4 · Supplementary readings for Week 4",
      },
      {
        key: "p1-w4-reflection",
        name: "Week 4 · Submit learning/reflection through DingTalk",
      },
      {
        key: "p1-w4-feedback",
        name: "Week 4 · Answer the August 28 feedback form",
      },
    ],
  },
  {
    // Deliberately last rather than one exam per week: the exams sit at the
    // end of Phase 1, so they sit at the end of the checklist.
    title: "Phase 1 final exams",
    items: [
      { key: "p1-exam-1", name: "Final exam · Session 1 exam" },
      { key: "p1-exam-2", name: "Final exam · Session 2 exam" },
      { key: "p1-exam-3", name: "Final exam · Session 3 exam" },
      { key: "p1-exam-4", name: "Final exam · Session 4 exam" },
      { key: "p1-exam-5", name: "Final exam · Session 5 exam" },
    ],
  },
];

/** The checklist flattened into the order it is stored and displayed in. */
export const PHASE1_ITEMS: Phase1Item[] = PHASE1_CHECKLIST.flatMap(
  (section) => section.items,
);

export type Phase1SeedOptions = {
  /**
   * Archive every other metric in the season, so the board shows the Phase 1
   * checklist and nothing else. History is kept — archived metrics keep their
   * entries and simply stop counting.
   */
  archiveOthers?: boolean;
};

export type Phase1SeedPlan = {
  created: Phase1Item[];
  updated: Phase1Item[];
  /** Already correct — same name, same position, still active. */
  unchanged: Phase1Item[];
  /** Metrics in this season that are not part of the checklist. */
  others: { id: string; key: string; name: string; active: boolean }[];
};

export class SeasonNotWritableError extends Error {
  constructor(status: string) {
    super(`Season is ${status}. Unlock it before seeding metrics.`);
    this.name = "SeasonNotWritableError";
  }
}

/**
 * Works out what seeding would do, without writing anything. The CLI shows
 * this before touching production, and `seedPhase1Metrics` applies it.
 */
export async function planPhase1Metrics(
  db: Database,
  seasonId: string,
): Promise<Phase1SeedPlan> {
  const existing = await db
    .select()
    .from(metrics)
    .where(eq(metrics.seasonId, seasonId));

  const byKey = new Map(existing.map((m) => [m.key, m]));
  const plan: Phase1SeedPlan = {
    created: [],
    updated: [],
    unchanged: [],
    others: existing
      .filter((m) => !PHASE1_ITEMS.some((item) => item.key === m.key))
      .map((m) => ({ id: m.id, key: m.key, name: m.name, active: m.active })),
  };

  PHASE1_ITEMS.forEach((item, index) => {
    const row = byKey.get(item.key);
    if (!row) {
      plan.created.push(item);
    } else if (
      row.name !== item.name ||
      row.sortOrder !== index ||
      !row.active
    ) {
      plan.updated.push(item);
    } else {
      plan.unchanged.push(item);
    }
  });

  return plan;
}

/**
 * Writes the checklist into a season. Safe to re-run: items are matched by
 * key, so this inserts what is missing and corrects what has drifted.
 */
export async function seedPhase1Metrics(
  db: Database,
  seasonId: string,
  options: Phase1SeedOptions = {},
): Promise<Phase1SeedPlan> {
  const [season] = await db
    .select({ id: seasons.id, status: seasons.status })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) throw new Error(`No season with id ${seasonId}`);
  if (season.status === "locked" || season.status === "archived") {
    throw new SeasonNotWritableError(season.status);
  }

  const plan = await planPhase1Metrics(db, seasonId);

  for (const [index, item] of PHASE1_ITEMS.entries()) {
    const isNew = plan.created.some((c) => c.key === item.key);

    if (isNew) {
      await db.insert(metrics).values({
        seasonId,
        key: item.key,
        name: item.name,
        // The legacy type/weight/target columns are ignored by scoring; they
        // are filled the same way `createMetric` fills them.
        type: "percentage",
        weight: 0,
        target: null,
        required: true,
        sortOrder: index,
        active: true,
      });
      continue;
    }

    await db
      .update(metrics)
      .set({ name: item.name, sortOrder: index, active: true })
      .where(and(eq(metrics.seasonId, seasonId), eq(metrics.key, item.key)));
  }

  if (options.archiveOthers && plan.others.length > 0) {
    await db
      .update(metrics)
      .set({ active: false })
      .where(
        and(
          eq(metrics.seasonId, seasonId),
          notInArray(
            metrics.key,
            PHASE1_ITEMS.map((item) => item.key),
          ),
        ),
      );
  }

  return plan;
}

/** The metric rows this checklist owns, in display order. */
export async function getPhase1Metrics(db: Database, seasonId: string) {
  return db
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.seasonId, seasonId),
        inArray(
          metrics.key,
          PHASE1_ITEMS.map((item) => item.key),
        ),
      ),
    )
    .orderBy(metrics.sortOrder);
}
