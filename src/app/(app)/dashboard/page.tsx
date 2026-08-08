import Link from "next/link";
import {
  Avatar,
  Card,
  Delta,
  DisplayNumber,
  Eyebrow,
  SectionTitle,
  StatTile,
  fmt,
  rankColor,
} from "@/components/ui";
import { MetricLogger } from "@/components/me/MetricLogger";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getSelfLog } from "@/db/queries/member";

export default async function DashboardPage() {
  const ctx = await getAppContext();
  const { standings } = ctx;

  // Members can log from here as well as from their card; Leaders and admins
  // have no membership to log against, so they just see the standings.
  const selfLog = ctx.membershipId
    ? await getSelfLog(getDb(), standings.season.id, ctx.membershipId)
    : [];

  const avg = (key: string) =>
    standings.members.length === 0
      ? 0
      : standings.members.reduce(
          (s, m) => s + (m.breakdown.find((b) => b.key === key)?.value ?? 0),
          0,
        ) / standings.members.length;

  // The attendance trend and session heatmap used to sit here too. They are
  // on /admin/analytics, which charts them from stored weekly snapshots rather
  // than recomputing — so this was a duplicate that could disagree with itself.
  const topFive = standings.members.slice(0, 5);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[22px] p-6 sm:p-8"
        style={{
          background:
            "linear-gradient(112deg,#12B5CB 0%,#4ACBD9 44%,#F97316 122%)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(420px 220px at 84% 0%, rgba(255,255,255,.4), transparent 72%)",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.24em] text-white/85 uppercase">
              Leaderboard · {standings.season.startsOn} —{" "}
              {standings.season.endsOn}
            </div>
            <DisplayNumber className="mt-2 text-[44px] text-white sm:text-[64px]">
              Evolve - Leaderboard
            </DisplayNumber>
            <p className="mt-2.5 text-[13.5px] font-semibold text-white/90">
              {standings.daysLeft} days left · {standings.memberCount} members
              across {standings.teamCount} teams
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile tone="onColor" label="Avg att" value={fmt.pct(avg("attendance"))} />
            <StatTile tone="onColor" label="Avg asn" value={fmt.pct(avg("assignment"))} />
            <StatTile tone="onColor" label="Active" value={standings.memberCount} />
          </div>
        </div>
      </div>

      {ctx.membershipId && selfLog.length > 0 && (
        <MetricLogger membershipId={ctx.membershipId} rows={selfLog} />
      )}

      {/* Top five */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>TOP 5 PLAYERS</SectionTitle>
          <Link
            href="/leaderboard"
            className="text-accent shrink-0 text-[11.5px] font-extrabold tracking-[0.08em]"
          >
            FULL LEADERBOARD ›
          </Link>
        </div>
        <ul className="mt-3.5">
          {topFive.map((p) => (
            <li
              key={p.membershipId}
              className="border-line-2 flex items-center gap-3 border-b py-3 last:border-0 sm:gap-4"
            >
              <DisplayNumber
                className="w-6 shrink-0 text-[22px]"
                style={{ color: rankColor(p.rank) }}
              >
                {p.rank}
              </DisplayNumber>
              <Avatar initials={p.initials} color={p.teamColor} size={38} />
              <div className="min-w-0 flex-1">
                <div className="text-ink truncate text-[14.5px] font-extrabold">
                  {p.name}
                </div>
                <div className="text-ink-3 truncate text-[11.5px] font-semibold">
                  {p.teamName}
                  {p.position ? ` · ${p.position}` : ""}
                </div>
              </div>
              <Delta value={p.delta} className="w-8 shrink-0 text-right" />
              <div className="hidden w-[70px] text-right sm:block">
                <Eyebrow className="text-ink-4">Att</Eyebrow>
                <div className="text-ink-2 text-[14px] font-bold">
                  {fmt.pct(
                    p.breakdown.find((b) => b.key === "attendance")?.value ?? 0,
                  )}
                </div>
              </div>
              <div className="hidden w-[70px] text-right sm:block">
                <Eyebrow className="text-ink-4">Streak</Eyebrow>
                <div className="text-accent text-[14px] font-extrabold">
                  🔥{p.streak}
                </div>
              </div>
              <div className="w-[62px] shrink-0 text-right sm:w-[72px]">
                <Eyebrow className="text-ink-4">Pts</Eyebrow>
                <DisplayNumber className="text-ink text-[24px] sm:text-[26px]">
                  {fmt.total(p.score)}
                </DisplayNumber>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
