import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { metrics } from "@/db/schema";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

export type MetricInput = {
  name: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validate(input: MetricInput): void {
  if (!input.name.trim()) throw new ConflictError("Metric name is required");
}

/**
 * Creates an equally-weighted metric.
 * The legacy type/weight/target columns are filled with neutral values for
 * compatibility, but scoring ignores them.
 */
export async function createMetric(
  db: Database,
  actor: Actor,
  seasonId: string,
  input: MetricInput,
): Promise<string> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);
  validate(input);

  const existing = await db
    .select({ key: metrics.key, sortOrder: metrics.sortOrder })
    .from(metrics)
    .where(eq(metrics.seasonId, seasonId));

  const base = slugify(input.name) || "metric";
  let key = base;
  let suffix = 2;
  while (existing.some((m) => m.key === key)) {
    key = `${base}-${suffix++}`;
  }

  const [row] = await db
    .insert(metrics)
    .values({
      seasonId,
      key,
      name: input.name.trim(),
      type: "percentage",
      weight: 0,
      target: null,
      required: true,
      sortOrder: existing.reduce((max, m) => Math.max(max, m.sortOrder + 1), 0),
      active: true,
    })
    .returning({ id: metrics.id });

  return row.id;
}

export async function updateMetric(
  db: Database,
  actor: Actor,
  metricId: string,
  input: MetricInput,
): Promise<void> {
  assertAdmin(actor);
  validate(input);

  const [metric] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.id, metricId))
    .limit(1);
  if (!metric) throw new NotFoundError("Metric");
  await assertSeasonWritable(db, metric.seasonId);

  await db
    .update(metrics)
    .set({
      name: input.name.trim(),
    })
    .where(eq(metrics.id, metricId));
}

/**
 * Soft-deletes. Entries reference metrics, so a row delete would cascade real
 * history away. Inactive metrics drop out of scoring and every screen.
 */
export async function setMetricActive(
  db: Database,
  actor: Actor,
  metricId: string,
  active: boolean,
): Promise<void> {
  assertAdmin(actor);

  const [metric] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.id, metricId))
    .limit(1);
  if (!metric) throw new NotFoundError("Metric");
  await assertSeasonWritable(db, metric.seasonId);

  await db.update(metrics).set({ active }).where(eq(metrics.id, metricId));
}

export async function reorderMetrics(
  db: Database,
  actor: Actor,
  seasonId: string,
  orderedIds: string[],
): Promise<void> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);

  for (const [index, id] of orderedIds.entries()) {
    await db
      .update(metrics)
      .set({ sortOrder: index })
      .where(and(eq(metrics.id, id), eq(metrics.seasonId, seasonId)));
  }
}
