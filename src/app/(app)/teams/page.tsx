import Link from "next/link";
import {
  Card,
  DisplayNumber,
  Eyebrow,
  StatTile,
  fmt,
  rankColor,
} from "@/components/ui";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getTeamStandings } from "@/db/queries/teams";

export default async function TeamsPage() {
  const { standings } = await getAppContext();
  const teams = await getTeamStandings(getDb(), standings);

  const champion = teams[0];
  const leaderPoints = champion?.points ?? 0;
  const contested = teams.filter((t) => t.memberCount > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Champion banner, matching the leaderboard's leader strip so the two
          standings pages read as a pair. */}
      {champion && (
        <div
          className="relative overflow-hidden rounded-[22px] p-6 sm:p-7"
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
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-white/80 uppercase">
                Top of the table · week {standings.weekNo}
              </div>
              <div className="mt-3 flex items-center gap-4">
                <div className="font-display flex size-[62px] shrink-0 items-center justify-center rounded-[18px] bg-white/95 text-[22px] font-extrabold sm:size-[70px] sm:text-[25px]"
                  style={{ color: champion.color }}
                >
                  {champion.abbr}
                </div>
                <div className="min-w-0">
                  <DisplayNumber className="truncate text-[40px] text-white sm:text-[52px]">
                    {champion.name}
                  </DisplayNumber>
                  <div className="mt-1 truncate text-[11.5px] font-extrabold tracking-[0.1em] text-white/75 uppercase">
                    {champion.coachName
                      ? `Leader ${champion.coachName}`
                      : "No leader assigned"}
                    {" · "}
                    {champion.memberCount} member
                    {champion.memberCount === 1 ? "" : "s"}
                    {champion.topPlayer ? ` · Top ${champion.topPlayer.name}` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <StatTile tone="onColor" label="Points" value={fmt.points(champion.points)} />
              <StatTile tone="onColor" label="Weeks won" value={champion.wins} />
              {/* Kept numeric: a name in a tile sized for big figures reads
                  as a broken number. The top player moves to the line above. */}
              <StatTile
                tone="onColor"
                label={`Avg ${champion.metricAverages[0]?.name ?? "score"}`}
                value={fmt.pct(champion.metricAverages[0]?.value ?? 0)}
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-ink-3 text-[12px] font-bold tracking-[0.04em]">
        {teams.length} team{teams.length === 1 ? "" : "s"} ·{" "}
        {standings.memberCount} members · ranked by total member score
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {teams.map((team) => {
          const behind = leaderPoints - team.points;
          const share = leaderPoints > 0 ? (team.points / leaderPoints) * 100 : 0;
          const isLeader = team.rank === 1;

          return (
            <Card
              key={team.teamId}
              className={
                // The leader gets a warm border so the top of the table is
                // findable without reading every rank number.
                isLeader ? "border-accent-line !bg-accent-tint" : undefined
              }
            >
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
                    {team.coachName ? `Leader ${team.coachName} · ` : ""}
                    {team.memberCount} member
                    {team.memberCount === 1 ? "" : "s"} · {team.wins}W
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <DisplayNumber className="text-ink text-[32px]">
                    {fmt.points(team.points)}
                  </DisplayNumber>
                  <Eyebrow className="text-ink-4">Points</Eyebrow>
                </div>
              </div>

              {/* Distance from the top, which a bare points total never shows. */}
              <div className="mt-4 flex items-center gap-3">
                <div className="bg-line-2 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.max(2, share)}%`,
                      background: team.color,
                    }}
                  />
                </div>
                <span
                  className={`shrink-0 text-[11px] font-extrabold tracking-[0.06em] uppercase ${
                    isLeader ? "text-accent" : "text-ink-3"
                  }`}
                >
                  {isLeader ? "Leader" : `−${fmt.points(behind)} behind`}
                </span>
              </div>

              {team.memberCount === 0 ? (
                <p className="text-ink-3 mt-4 text-[12.5px] font-semibold">
                  No members yet — this team is not scored.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {team.metricAverages.map((metric) => (
                      <div
                        key={metric.key}
                        className="bg-surface-2 rounded-xl px-3.5 py-2.5"
                      >
                        <Eyebrow>Avg {metric.name}</Eyebrow>
                        <DisplayNumber className="text-ink mt-0.5 text-[23px]">
                          {fmt.pct(metric.value)}
                        </DisplayNumber>
                      </div>
                    ))}
                  </div>

                  <div className="border-line-2 mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
                    <TeamPlayer
                      label="Top"
                      name={team.topPlayer?.name}
                      membershipId={team.topPlayer?.membershipId}
                      tone="positive"
                    />
                    {team.bottomPlayer && (
                      <TeamPlayer
                        label="Needs attention"
                        name={team.bottomPlayer.name}
                        membershipId={team.bottomPlayer.membershipId}
                        tone="negative"
                      />
                    )}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>

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

function TeamPlayer({
  label,
  name,
  membershipId,
  tone,
}: {
  label: string;
  name: string | undefined;
  membershipId: string | undefined;
  tone: "positive" | "negative";
}) {
  if (!name) return null;
  return (
    <div className="min-w-0">
      <Eyebrow className={tone === "positive" ? "text-positive" : "text-negative"}>
        {label}
      </Eyebrow>
      {membershipId ? (
        <Link
          href={`/members/${membershipId}`}
          className="text-ink hover:text-primary mt-1 block truncate text-[14px] font-extrabold"
        >
          {name}
        </Link>
      ) : (
        <div className="text-ink mt-1 truncate text-[14px] font-extrabold">
          {name}
        </div>
      )}
    </div>
  );
}
