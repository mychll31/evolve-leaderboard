import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CoachChoice } from "@/components/coach/CoachChoice";
import { Card, DisplayNumber, Eyebrow, fmt } from "@/components/ui";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { teams, weeklyAwards } from "@/db/schema";

export default async function CoachPage(props: {
  searchParams: Promise<{ team?: string }>;
}) {
  const ctx = await getAppContext();
  const db = getDb();
  const { team: requestedTeam } = await props.searchParams;

  // Which teams may this user open? Leaders get theirs; a super admin gets all.
  const allowed = ctx.isAdmin
    ? (
        await db
          .select({ id: teams.id, name: teams.name, color: teams.color })
          .from(teams)
          .where(eq(teams.seasonId, ctx.standings.season.id))
          .orderBy(teams.sortOrder)
      ).map((t) => ({ id: t.id, name: t.name, color: t.color }))
    : ctx.coachedTeams;

  if (allowed.length === 0) redirect("/dashboard");

  // A team id in the URL is never trusted — it must be in the allowed set.
  const activeTeam =
    allowed.find((t) => t.id === requestedTeam) ?? allowed[0];
  if (requestedTeam && !allowed.some((t) => t.id === requestedTeam)) {
    notFound();
  }

  const teamMembers = ctx.standings.members.filter(
    (m) => m.teamId === activeTeam.id,
  );
  const bottomPerformers = [...teamMembers]
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, 3);
  const teamAverage =
    teamMembers.length === 0
      ? 0
      : teamMembers.reduce((sum, member) => sum + member.score, 0) /
        teamMembers.length;

  // This week's Leader's-choice nomination for this team, if one exists.
  const [choiceRow] = await db
    .select({
      membershipId: weeklyAwards.membershipId,
      note: weeklyAwards.note,
    })
    .from(weeklyAwards)
    .where(
      and(
        eq(weeklyAwards.seasonId, ctx.standings.season.id),
        eq(weeklyAwards.weekNo, ctx.standings.weekNo),
        eq(weeklyAwards.category, "coach_choice"),
        eq(weeklyAwards.teamId, activeTeam.id),
      ),
    )
    .limit(1);

  const choice = choiceRow
    ? {
        membershipId: choiceRow.membershipId,
        name:
          ctx.standings.members.find(
            (m) => m.membershipId === choiceRow.membershipId,
          )?.name ?? "Unknown",
        note: choiceRow.note,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      {allowed.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {allowed.map((team) => {
            const active = team.id === activeTeam.id;
            return (
              <Link
                key={team.id}
                href={`/coach?team=${team.id}`}
                className="rounded-full border px-3.5 py-2 text-[12px] font-bold whitespace-nowrap"
                style={{
                  background: active ? team.color : "#FFFFFF",
                  color: active ? "#FFFFFF" : "var(--color-ink-2)",
                  borderColor: active ? team.color : "var(--color-line)",
                }}
              >
                {team.name}
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Eyebrow>Leader desk</Eyebrow>
                <DisplayNumber className="text-ink mt-1 text-[34px]">
                  {activeTeam.name}
                </DisplayNumber>
              </div>
              <div className="text-right">
                <DisplayNumber className="text-ink text-[34px]">
                  {fmt.total(teamAverage)}
                </DisplayNumber>
                <Eyebrow className="text-ink-4">Team average</Eyebrow>
              </div>
            </div>

            <div className="mt-5 -mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-line bg-surface-2 text-ink-3 border-y text-[10px] font-extrabold tracking-[0.14em] uppercase">
                    <th className="px-5 py-3 text-left sm:px-6">Player</th>
                    <th className="px-2 py-3 text-left">Rank</th>
                    <th className="px-2 py-3 text-left">Score</th>
                    <th className="px-5 py-3 text-right sm:px-6">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => (
                    <tr
                      key={member.membershipId}
                      className="border-line-2 border-b last:border-0"
                    >
                      <td className="px-5 py-3 sm:px-6">
                        <div className="text-ink text-[13.5px] font-bold">
                          {member.name}
                        </div>
                        <div className="text-ink-3 text-[11.5px] font-semibold">
                          {member.position ?? "Member"}
                        </div>
                      </td>
                      <td className="text-ink-2 px-2 py-3 text-[13px] font-bold">
                        #{member.rank}
                      </td>
                      <td className="px-2 py-3">
                        <DisplayNumber className="text-ink text-[22px]">
                          {fmt.total(member.score)}
                        </DisplayNumber>
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        <Link
                          href={`/members/${member.membershipId}`}
                          className="border-line text-ink-2 hover:bg-surface-2 rounded-[10px] border bg-white px-3 py-2 text-[11.5px] font-extrabold tracking-[0.06em] uppercase"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {teamMembers.length === 0 && (
              <p className="text-ink-3 mt-4 text-[13px] font-semibold">
                No members yet.
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <CoachChoice
            seasonId={ctx.standings.season.id}
            weekNo={ctx.standings.weekNo}
            roster={ctx.standings.members.filter(
              (m) => m.teamId === activeTeam.id,
            )}
            current={choice}
          />

          <Card>
            <Eyebrow className="text-positive">Top performers</Eyebrow>
            <ul className="mt-3.5 flex flex-col gap-3">
              {teamMembers.slice(0, 3).map((p) => (
                <li key={p.membershipId} className="flex items-center justify-between gap-3">
                  <span className="text-ink-2 truncate text-[13.5px] font-bold">
                    {p.name}
                  </span>
                  <DisplayNumber className="text-ink text-[20px]">
                    {fmt.total(p.score)}
                  </DisplayNumber>
                </li>
              ))}
              {teamMembers.length === 0 && (
                <li className="text-ink-3 text-[13px] font-semibold">
                  No members yet.
                </li>
              )}
            </ul>
          </Card>

          <Card>
            <Eyebrow className="text-negative">Needs attention</Eyebrow>
            <ul className="mt-3.5 flex flex-col gap-3">
              {bottomPerformers.map((p) => (
                <li key={p.membershipId} className="flex items-center justify-between gap-3">
                  <span className="text-ink-2 truncate text-[13.5px] font-bold">
                    {p.name}
                  </span>
                  <DisplayNumber className="text-ink-2 text-[20px]">
                    {fmt.total(p.score)}
                  </DisplayNumber>
                </li>
              ))}
              {bottomPerformers.length === 0 && (
                <li className="text-ink-3 text-[13px] font-semibold">
                  No members yet.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
