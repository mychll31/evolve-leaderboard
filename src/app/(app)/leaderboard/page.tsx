import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";
import { getAppContext } from "@/db/queries/context";

export default async function LeaderboardPage() {
  const { standings } = await getAppContext();

  // Teams that actually have members, in standings order.
  const seen = new Map<string, { id: string; name: string; color: string }>();
  for (const m of standings.members) {
    if (!seen.has(m.teamId)) {
      seen.set(m.teamId, { id: m.teamId, name: m.teamName, color: m.teamColor });
    }
  }

  return (
    <LeaderboardClient
      members={standings.members}
      teams={[...seen.values()].sort((a, b) => a.name.localeCompare(b.name))}
      metrics={standings.metrics.map((m) => ({ key: m.key, name: m.name }))}
    />
  );
}
