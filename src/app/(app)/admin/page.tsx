import { and, eq } from "drizzle-orm";
import { MetricBuilder } from "@/components/admin/MetricBuilder";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { metrics } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/auth/guards";

export default async function AdminPage() {
  // Guarded here as well as in each action — the nav hides this link for
  // non-admins, but a hidden link is not access control.
  await requireSuperAdmin();
  const ctx = await getAppContext();

  const rows = await getDb()
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.seasonId, ctx.standings.season.id),
        eq(metrics.active, true),
      ),
    )
    .orderBy(metrics.sortOrder);

  return (
    <MetricBuilder
      seasonId={ctx.standings.season.id}
      formula={ctx.standings.season.formula}
      members={ctx.standings.members}
      metrics={rows.map((m) => ({
        id: m.id,
        key: m.key,
        name: m.name,
        type: m.type,
        weight: m.weight,
        required: m.required,
      }))}
    />
  );
}
