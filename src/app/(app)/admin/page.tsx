import { MetricBuilder } from "@/components/admin/MetricBuilder";
import { MetricsManager } from "@/components/admin/MetricsManager";
import { getDb } from "@/db/client";
import { listMetrics } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";

export default async function AdminPage() {
  const ctx = await getAppContext();
  const rows = await listMetrics(getDb(), ctx.standings.season.id);
  const active = rows.filter((m) => m.active);

  return (
    <div className="flex flex-col gap-6">
      <MetricBuilder
        seasonId={ctx.standings.season.id}
        formula={ctx.standings.season.formula}
        members={ctx.standings.members}
        metrics={active.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          type: m.type,
          weight: m.weight,
          required: m.required,
        }))}
      />
      <MetricsManager
        seasonId={ctx.standings.season.id}
        metrics={rows}
        formula={ctx.standings.season.formula}
      />
    </div>
  );
}
