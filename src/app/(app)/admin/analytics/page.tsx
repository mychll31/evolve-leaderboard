import { AnalyticsPanel } from "@/components/admin/AnalyticsPanel";
import { getAppContext } from "@/db/queries/context";

export default async function AdminAnalyticsPage() {
  const ctx = await getAppContext();
  return <AnalyticsPanel standings={ctx.standings} />;
}
