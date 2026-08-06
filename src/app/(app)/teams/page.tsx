import {
  Card,
  DisplayNumber,
  Eyebrow,
  fmt,
  rankColor,
} from "@/components/ui";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getTeamStandings } from "@/db/queries/teams";

export default async function TeamsPage() {
  const { standings } = await getAppContext();
  const teams = await getTeamStandings(getDb(), standings);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {teams.map((team) => (
        <Card key={team.teamId}>
          <div className="flex items-center gap-3.5">
            <DisplayNumber
              className="w-8 shrink-0 text-[28px]"
              style={{ color: rankColor(team.rank) }}
            >
              {team.rank}
            </DisplayNumber>
            <div
              className="font-display flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[19px] font-extrabold text-white"
              style={{ background: team.color }}
            >
              {team.abbr}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-ink truncate text-[24px] leading-tight font-bold tracking-[0.03em] sm:text-[27px]">
                {team.name}
              </div>
              <div className="text-ink-3 truncate text-[11.5px] font-semibold">
                {team.coachName ? `Coach ${team.coachName} · ` : ""}
                {team.memberCount} member{team.memberCount === 1 ? "" : "s"} ·{" "}
                {team.wins}W
              </div>
            </div>
            <div className="shrink-0 text-right">
              <DisplayNumber className="text-ink text-[32px]">
                {fmt.points(team.points)}
              </DisplayNumber>
              <Eyebrow className="text-ink-4">Points</Eyebrow>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {team.metricAverages.map((metric) => (
              <div key={metric.key} className="bg-surface-2 rounded-xl px-3.5 py-2.5">
                <Eyebrow>Avg {metric.name}</Eyebrow>
                <DisplayNumber className="text-ink mt-0.5 text-[23px]">
                  {fmt.pct(metric.value)}
                </DisplayNumber>
              </div>
            ))}
            <div className="bg-surface-2 rounded-xl px-3.5 py-2.5">
              <Eyebrow>Top player</Eyebrow>
              <div className="text-ink mt-1.5 truncate text-[14px] font-extrabold">
                {team.topPlayer?.name ?? "—"}
              </div>
            </div>
          </div>

        </Card>
      ))}
    </div>
  );
}
