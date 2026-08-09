import { Card, DisplayNumber, StatTile, fmt } from "@/components/ui";
import { TeamStandingsAccordion } from "@/components/teams/TeamStandingsAccordion";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getTeamStandings } from "@/db/queries/teams";

export default async function TeamsPage() {
  const { standings } = await getAppContext();
  const teams = await getTeamStandings(getDb(), standings);

  const champion = teams[0];
  const leaderPoints = champion?.points ?? 0;
  const championAverage = champion && champion.memberCount > 0
    ? champion.points / champion.memberCount
    : 0;
  const championTotalScore = champion?.points ?? 0;
  const contested = teams.filter((t) => t.memberCount > 0);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Champion banner, matching the leaderboard's leader strip so the two
          standings pages read as a pair. */}
      {champion && (
        <div
          className="relative min-w-0 overflow-hidden rounded-[22px] p-5 sm:p-7"
          style={{
            background: `linear-gradient(112deg, ${champion.color} 0%, #0F1720 118%)`,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(420px 220px at 88% 0%, rgba(255,255,255,.28), transparent 70%)",
            }}
          />
          <div className="relative flex min-w-0 flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-white/80 uppercase">
                Top of the table
              </div>
              <div className="mt-3 flex min-w-0 items-center gap-3.5 sm:gap-4">
                <div
                  className="font-display flex size-[62px] shrink-0 items-center justify-center rounded-[18px] bg-white/95 text-[22px] font-extrabold sm:size-[70px] sm:text-[25px]"
                  style={{ color: champion.color }}
                >
                  {champion.abbr}
                </div>
                <div className="min-w-0">
                  <DisplayNumber className="truncate text-[36px] text-white sm:text-[52px]">
                    {champion.name}
                  </DisplayNumber>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11.5px] font-extrabold tracking-[0.1em] text-white/75 uppercase">
                    <span>
                      {champion.coachName
                        ? `Leader ${champion.coachName}`
                        : "No leader assigned"}
                    </span>
                    <span>
                      {champion.memberCount} member
                      {champion.memberCount === 1 ? "" : "s"}
                    </span>
                    <span>Total score {fmt.score(championTotalScore)}%</span>
                    <span>Avg score {fmt.total(championAverage)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:min-w-[320px]">
              <StatTile
                tone="onColor"
                label="Total score"
                value={`${fmt.score(championTotalScore)}%`}
              />
              <StatTile
                tone="onColor"
                label="Avg score"
                value={fmt.total(championAverage)}
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-ink-3 text-[12px] font-bold tracking-[0.04em]">
        {teams.length} team{teams.length === 1 ? "" : "s"} ·{" "}
        {standings.memberCount} members · ranked by total team score
      </p>

      <TeamStandingsAccordion teams={teams} leaderPoints={leaderPoints} />

      {contested.length === 0 && (
        <Card>
          <p className="text-ink-2 text-[14px] font-semibold">
            No teams have members yet. Add people at Admin → People.
          </p>
        </Card>
      )}
    </div>
  );
}
