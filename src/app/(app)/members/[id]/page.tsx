import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Avatar,
  Card,
  Delta,
  DisplayNumber,
  Eyebrow,
  ProgressBar,
  fmt,
} from "@/components/ui";
import { MemberEditor } from "@/components/members/MemberEditor";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getMemberDetail } from "@/db/queries/member";
import { canManageMembership } from "@/lib/auth/scoping";

export default async function MemberPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const ctx = await getAppContext();
  const db = getDb();

  const member = await getMemberDetail(db, ctx.standings, id);
  if (!member) notFound();

  const canEdit = await canManageMembership(db, ctx.user, id);
  const isOwn = ctx.membershipId === id;

  // Members may read their own page; everyone else needs write scope to see it.
  if (!canEdit && !isOwn) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div
        className="relative overflow-hidden rounded-[22px] p-6 sm:p-7"
        style={{
          background: `linear-gradient(150deg, ${member.teamColor} -10%, #0F1720 120%)`,
        }}
      >
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar
            initials={member.initials}
            color="rgba(255,255,255,.95)"
            size={72}
            className="!text-[#0F1720]"
          />
          <div className="min-w-0 flex-1">
            <DisplayNumber className="truncate text-[38px] text-white sm:text-[46px]">
              {member.name}
            </DisplayNumber>
            <div className="mt-1 truncate text-[12px] font-extrabold tracking-[0.12em] text-white/75">
              {member.teamName}
              {member.position ? ` · ${member.position}` : ""} ·{" "}
              {member.seasonRole}
              {!member.active && " · INACTIVE"}
            </div>
            <div className="mt-1 truncate text-[12px] font-semibold text-white/55">
              {member.email}
            </div>
          </div>
          {member.standing && (
            <div className="flex gap-2.5">
              <div className="rounded-[14px] border border-white/30 bg-white/20 px-4 py-2.5">
                <div className="text-[9.5px] font-extrabold tracking-[0.14em] text-white/85 uppercase">
                  Rank
                </div>
                <DisplayNumber className="mt-0.5 text-[26px] text-white">
                  #{member.standing.rank}
                </DisplayNumber>
              </div>
              <div className="rounded-[14px] border border-white/30 bg-white/20 px-4 py-2.5">
                <div className="text-[9.5px] font-extrabold tracking-[0.14em] text-white/85 uppercase">
                  Score
                </div>
                <DisplayNumber className="mt-0.5 text-[26px] text-white">
                  {fmt.total(member.standing.score)}
                </DisplayNumber>
              </div>
              <div className="rounded-[14px] border border-white/30 bg-white/20 px-4 py-2.5">
                <div className="text-[9.5px] font-extrabold tracking-[0.14em] text-white/85 uppercase">
                  Streak
                </div>
                <DisplayNumber className="mt-0.5 text-[26px] text-white">
                  🔥{member.standing.streak}
                </DisplayNumber>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <MemberEditor member={member} canEdit={canEdit} />
        </div>

        <div className="flex flex-col gap-4">
          {member.standing ? (
            <Card>
              <Eyebrow>Score breakdown</Eyebrow>
              <div className="mt-4 flex flex-col gap-4">
                {member.standing.breakdown.map((part) => (
                  <div key={part.key}>
                    <div className="flex items-baseline justify-between text-[12.5px] font-bold">
                      <span className="text-ink-2">
                        {part.name}{" "}
                        <span className="text-ink-4">· {part.weight}%</span>
                      </span>
                      <span className="text-ink">{fmt.pct(part.value)}</span>
                    </div>
                    <ProgressBar className="mt-1.5" height={7} gradient value={part.value} />
                  </div>
                ))}
              </div>
              <div className="border-line mt-5 flex items-center justify-between border-t pt-4">
                <Delta value={member.standing.delta} />
                <DisplayNumber className="text-ink text-[30px]">
                  {fmt.total(member.standing.score)}
                </DisplayNumber>
              </div>
            </Card>
          ) : (
            <Card>
              <Eyebrow>Not scored</Eyebrow>
              <p className="text-ink-2 mt-2 text-[13px] font-semibold">
                Coaches do not appear in the standings.
              </p>
            </Card>
          )}

          <Card>
            <Eyebrow>Navigate</Eyebrow>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/leaderboard"
                className="border-line text-ink-2 hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-[13px] font-bold"
              >
                Leaderboard
              </Link>
              {ctx.isCoach && (
                <Link
                  href={`/coach?team=${member.teamId}`}
                  className="border-line text-ink-2 hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-[13px] font-bold"
                >
                  {member.teamName} coach desk
                </Link>
              )}
              {ctx.isAdmin && (
                <Link
                  href="/admin/people"
                  className="border-line text-ink-2 hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-[13px] font-bold"
                >
                  All people
                </Link>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
