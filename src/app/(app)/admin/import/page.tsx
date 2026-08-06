import { ImportManager } from "@/components/admin/ImportManager";
import { getDb } from "@/db/client";
import { listTeams } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";
import { toCsv } from "@/lib/csv";

export default async function AdminImportPage() {
  const ctx = await getAppContext();
  const teams = await listTeams(getDb(), ctx.standings.season.id);

  // Export mirrors the import columns, plus current results, so a downloaded
  // roster can be edited and fed straight back in.
  const metricKeys = ctx.standings.metrics.map((m) => m.name);
  const exportCsv = toCsv(
    ["name", "email", "team", "position", "role", "rank", "score", ...metricKeys],
    ctx.standings.members.map((member) => [
      member.name,
      "",
      member.teamName,
      member.position ?? "",
      "member",
      member.rank,
      member.score.toFixed(1),
      ...ctx.standings.metrics.map(
        (metric) =>
          member.breakdown.find((b) => b.key === metric.key)?.value.toFixed(1) ??
          "0",
      ),
    ]),
  );

  return (
    <ImportManager
      seasonId={ctx.standings.season.id}
      teamNames={teams.map((t) => t.name)}
      exportCsv={exportCsv}
    />
  );
}
