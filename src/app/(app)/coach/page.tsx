import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AttendanceList, DeskCounters } from "@/components/coach/AttendanceList";
import { CoachChoice } from "@/components/coach/CoachChoice";
import { Card, DisplayNumber, Eyebrow } from "@/components/ui";
import { getDb } from "@/db/client";
import { getCoachDesk } from "@/db/queries/coach";
import { getAppContext } from "@/db/queries/context";
import { teams, weeklyAwards } from "@/db/schema";
import { coachTeamIds } from "@/lib/auth/scoping";

export default async function CoachPage(props: {
  searchParams: Promise<{ team?: string }>;
}) {
  const ctx = await getAppContext();
  const db = getDb();
  const { team: requestedTeam } = await props.searchParams;

  // Which teams may this user open? Coaches get theirs; a super admin gets all.
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

  const desk = await getCoachDesk(db, ctx.standings, activeTeam.id);
  if (!desk) notFound();

  // This week's coach's-choice nomination for this team, if one exists.
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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-w-0 flex-col gap-5">
          <DeskCounters desk={desk} />
          <AttendanceList desk={desk} />
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
              {desk.topPerformers.map((p) => (
                <li key={p.membershipId} className="flex items-center justify-between gap-3">
                  <span className="text-ink-2 truncate text-[13.5px] font-bold">
                    {p.name}
                  </span>
                  <DisplayNumber className="text-ink text-[20px]">
                    {p.score.toFixed(1)}
                  </DisplayNumber>
                </li>
              ))}
              {desk.topPerformers.length === 0 && (
                <li className="text-ink-3 text-[13px] font-semibold">
                  No members yet.
                </li>
              )}
            </ul>
          </Card>

          <Card>
            <Eyebrow className="text-negative">Needs attention</Eyebrow>
            <ul className="mt-3.5 flex flex-col gap-3">
              {desk.bottomPerformers.map((p) => (
                <li key={p.membershipId} className="flex items-center justify-between gap-3">
                  <span className="text-ink-2 truncate text-[13.5px] font-bold">
                    {p.name}
                  </span>
                  <DisplayNumber className="text-ink-2 text-[20px]">
                    {p.score.toFixed(1)}
                  </DisplayNumber>
                </li>
              ))}
              {desk.bottomPerformers.length === 0 && (
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
