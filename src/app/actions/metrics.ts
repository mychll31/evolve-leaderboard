"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { metrics, seasons } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { FORMULAS, type Formula } from "@/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  for (const path of ["/admin", "/dashboard", "/leaderboard", "/teams", "/me"]) {
    revalidatePath(path);
  }
}

/**
 * The spec places metric CRUD in Build 2. These two actions are pulled forward
 * because a builder whose steppers do not persist is the same dead-button
 * problem we removed from the Coach Desk. Creating, renaming and deleting
 * metrics still waits for Build 2.
 */
export async function updateMetricWeightAction(
  metricId: string,
  weight: number,
): Promise<ActionResult> {
  await requireSuperAdmin();

  if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
    return { ok: false, error: "Weight must be between 0 and 100" };
  }

  await getDb()
    .update(metrics)
    .set({ weight })
    .where(eq(metrics.id, metricId));

  revalidateAll();
  return { ok: true };
}

export async function updateSeasonFormulaAction(
  seasonId: string,
  formula: string,
): Promise<ActionResult> {
  await requireSuperAdmin();

  if (!FORMULAS.includes(formula as Formula)) {
    return { ok: false, error: `Unknown formula: ${formula}` };
  }

  await getDb()
    .update(seasons)
    .set({ formula: formula as Formula })
    .where(eq(seasons.id, seasonId));

  revalidateAll();
  return { ok: true };
}
