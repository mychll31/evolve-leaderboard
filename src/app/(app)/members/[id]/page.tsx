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

  // Teammates may read each other. The team page already names them and shows
  // what each has done, so refusing the page behind that link was a dead end
  // rather than a protection — and the leaderboard publishes every score to
  // everyone anyway. Anyone further out still needs write scope.
  const ownTeamId = ctx.membershipId
    ? ctx.standings.members.find((m) => m.membershipId === ctx.membershipId)
        ?.teamId
    : null;
  const isTeammate = ownTeamId !== null && ownTeamId === member.teamId;

  if (!canEdit && !isOwn && !isTeammate) notFound();

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
            <div className="flex max-w-full flex-wrap justify-end gap-2.5">
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
                  Points
                </div>
                <DisplayNumber className="mt-0.5 text-[26px] text-white">
                  {fmt.activityPoints(member.standing.activityPoints)}
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

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
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
                        {part.name}
                      </span>
                      <span className="text-ink">{fmt.pct(part.value)}</span>
                    </div>
                    <ProgressBar className="mt-1.5" height={7} gradient value={part.value} />
                  </div>
                ))}
              </div>
              {/* Spelled out only when there is something to explain: the
                  total below is already net, so a deduction would otherwise
                  read as the metrics not adding up. */}
              {member.standing.penaltyPoints > 0 && (
                <div className="border-line-2 mt-5 border-t pt-4">
                  <div className="flex items-baseline justify-between text-[12.5px] font-bold">
                    <span className="text-ink-2">Points earned</span>
                    <span className="text-ink">
                      {fmt.activityPoints(member.standing.baseActivityPoints)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between text-[12.5px] font-bold">
                    <span className="text-negative">Minus points</span>
                    <span className="text-negative">
                      −{fmt.penalty(member.standing.penaltyPoints)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between text-[12.5px] font-bold">
                    <span className="text-ink-2">Total points</span>
                    <span className="text-ink">
                      {fmt.activityPoints(member.standing.activityPoints)}
                    </span>
                  </div>
                </div>
              )}
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
                Leaders do not appear in the standings.
              </p>
            </Card>
          )}

          {member.penalties.length > 0 && (
            <Card>
              <Eyebrow>Minus points</Eyebrow>
              <ul className="mt-3 flex flex-col gap-3">
                {member.penalties.map((penalty) => (
                  <li
                    key={penalty.id}
                    className="border-line-2 flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="text-ink-2 text-[13px] font-semibold">
                        {penalty.reason || "No reason given"}
                      </div>
                      <div className="text-ink-4 text-[11px] font-semibold">
                        {penalty.issuedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                        {penalty.issuedByName
                          ? ` · by ${penalty.issuedByName}`
                          : ""}
                      </div>
                    </div>
                    <span className="text-negative shrink-0 text-[15px] font-extrabold">
                      −{fmt.penalty(penalty.points)}
                    </span>
                  </li>
                ))}
              </ul>
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
                  {member.teamName} Leader desk
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
