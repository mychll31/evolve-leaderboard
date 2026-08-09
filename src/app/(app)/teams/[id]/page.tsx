import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DisplayNumber, Eyebrow, fmt } from "@/components/ui";
import { TeamLogGrid } from "@/components/teams/TeamLogGrid";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getTeamRoster } from "@/db/queries/teams";

/**
 * One team's logging board: every member against every metric.
 *
 * Exists because the standings answer "how is the team doing" but not "who has
 * not done it yet", which is the question a Leader has to act on.
 */
export default async function TeamDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const ctx = await getAppContext();

  // Same scope rule as the standings page: an admin sees any team, a Leader
  // sees the teams they lead, a member sees their own.
  const ownTeamId = ctx.membershipId
    ? ctx.standings.members.find((m) => m.membershipId === ctx.membershipId)
        ?.teamId
    : null;
  const allowed =
    ctx.isAdmin ||
    ctx.coachedTeams.some((team) => team.id === id) ||
    ownTeamId === id;
  if (!allowed) notFound();

  const roster = await getTeamRoster(getDb(), ctx.standings, id);
  if (!roster) notFound();

  const total = roster.metrics.length;
  const behind = [...roster.members]
    .filter((m) => m.loggedCount < total)
    .sort((a, b) => a.loggedCount - b.loggedCount || a.name.localeCompare(b.name));
  const teamLogged = roster.members.reduce((sum, m) => sum + m.loggedCount, 0);
  const teamPossible = roster.members.length * total;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div
        className="relative min-w-0 overflow-hidden rounded-[22px] p-5 sm:p-7"
        style={{
          background: `linear-gradient(112deg, ${roster.color} 0%, #0F1720 118%)`,
        }}
      >
        <div className="relative flex min-w-0 flex-wrap items-center gap-4">
          <div
            className="font-display flex size-[58px] shrink-0 items-center justify-center rounded-[18px] bg-white/95 text-[21px] font-extrabold"
            style={{ color: roster.color }}
          >
            {roster.abbr}
          </div>
          <div className="min-w-0 flex-1">
            <DisplayNumber className="truncate text-[34px] text-white sm:text-[46px]">
              {roster.name}
            </DisplayNumber>
            <div className="mt-1 truncate text-[11.5px] font-extrabold tracking-[0.1em] text-white/75 uppercase">
              {roster.coachName
                ? `Leader ${roster.coachName}`
                : "No leader assigned"}{" "}
              · {roster.members.length} member
              {roster.members.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-right">
            <DisplayNumber className="text-[30px] text-white sm:text-[36px]">
              {teamPossible === 0 ? "—" : `${teamLogged}/${teamPossible}`}
            </DisplayNumber>
            <div className="text-[10px] font-extrabold tracking-[0.16em] text-white/70 uppercase">
              Things done
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/teams"
          className="border-line text-ink-2 hover:bg-surface-2 rounded-xl border bg-white px-3.5 py-2 text-[12px] font-bold"
        >
          ‹ Back to teams
        </Link>
        <p className="text-ink-3 text-[12px] font-bold tracking-[0.04em]">
          {total} thing{total === 1 ? "" : "s"} to do this season
        </p>
      </div>

      {roster.members.length === 0 ? (
        <Card>
          <p className="text-ink-2 text-[14px] font-semibold">
            Nobody is on this team yet.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <Eyebrow>Still to do</Eyebrow>
            {behind.length === 0 ? (
              <p className="text-positive mt-2 text-[13.5px] font-bold">
                Everyone is done. Nothing left!
              </p>
            ) : (
              <>
                <p className="text-ink-3 mt-1.5 text-[12.5px] font-semibold">
                  {behind.length} of {roster.members.length}{" "}
                  {roster.members.length === 1 ? "person" : "people"} still have
                  things to do. Least done first.
                </p>
                <ul className="mt-3.5 flex flex-col gap-2">
                  {behind.map((member) => (
                    <li
                      key={member.membershipId}
                      className="border-line-2 bg-surface-2 flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5"
                    >
                      <Link
                        href={`/members/${member.membershipId}`}
                        className="text-ink hover:text-primary min-w-0 flex-1 truncate text-[13.5px] font-extrabold"
                      >
                        {member.name}
                      </Link>
                      <span className="text-negative shrink-0 text-[12.5px] font-extrabold">
                        {total - member.loggedCount} left
                      </span>
                      <span className="text-ink-3 shrink-0 text-[12px] font-bold">
                        {member.loggedCount}/{total}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <TeamLogGrid roster={roster} />
        </>
      )}
    </div>
  );
}
