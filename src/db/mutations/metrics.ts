import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { metricEntries, metrics } from "@/db/schema";
import { METRIC_TYPES, type MetricType } from "@/domain/types";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

export type MetricInput = {
  name: string;
  type: MetricType;
  target?: number | null;
  required?: boolean;
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
  if (!METRIC_TYPES.includes(input.type)) {
    throw new ConflictError(`Unknown metric type "${input.type}"`);
  }
  if (input.type === "integer" || input.type === "decimal") {
    if (input.target === null || input.target === undefined || input.target <= 0) {
      throw new ConflictError(
        `A ${input.type} metric needs a positive target to scale against — without one it can never score above zero`,
      );
    }
  }
}

async function hasEntries(db: Database, metricId: string): Promise<boolean> {
  const [entry] = await db
    .select({ id: metricEntries.id })
    .from(metricEntries)
    .where(eq(metricEntries.metricId, metricId))
    .limit(1);
  return Boolean(entry);
}

/**
 * Creates a metric at weight 0.
 *
 * Anything higher would dilute every score the instant it is saved, while
 * nobody yet holds an entry for it — the whole leaderboard would drop together
 * for no reason a member could see. The admin raises the weight deliberately,
 * once there is data behind it.
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
      type: input.type,
      weight: 0,
      target: input.target ?? null,
      required: input.required ?? false,
      sortOrder: existing.reduce((max, m) => Math.max(max, m.sortOrder + 1), 0),
      active: true,
    })
    .returning({ id: metrics.id });

  return row.id;
}

/**
 * Edits a metric.
 *
 * `type` is immutable once any entry exists: `value` is a bare REAL whose
 * meaning comes entirely from the type — 1/0 for a boolean, a count for an
 * integer, 1-10 for a manual score — so changing it would silently
 * reinterpret every historical record. `target` stays editable because
 * rescaling is a legitimate correction.
 */
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

  if (input.type !== metric.type && (await hasEntries(db, metricId))) {
    throw new ConflictError(
      `"${metric.name}" already has recorded values, so its type can no longer change. Create a new metric instead.`,
    );
  }

  await db
    .update(metrics)
    .set({
      name: input.name.trim(),
      type: input.type,
      target: input.target ?? null,
      required: input.required ?? metric.required,
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
