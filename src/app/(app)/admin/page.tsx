import { MetricsManager } from "@/components/admin/MetricsManager";
import { getDb } from "@/db/client";
import { listMetrics } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";

export default async function AdminPage() {
  const ctx = await getAppContext();
  const rows = await listMetrics(getDb(), ctx.standings.season.id);

  return <MetricsManager seasonId={ctx.standings.season.id} metrics={rows} />;
}
