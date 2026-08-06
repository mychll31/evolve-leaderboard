import Link from "next/link";
import {
  Avatar,
  Card,
  Delta,
  DisplayNumber,
  Eyebrow,
  ProgressBar,
  SectionTitle,
  StatTile,
  fmt,
  rankColor,
} from "@/components/ui";
import { getAppContext } from "@/db/queries/context";
import { getDb } from "@/db/client";
import { getTeamStandings } from "@/db/queries/teams";

export default async function DashboardPage() {
  const ctx = await getAppContext();
  const { standings } = ctx;
  const teams = (await getTeamStandings(getDb(), standings)).slice(0, 5);

  const mvp = standings.members[0];
  const own = ctx.membershipId
    ? standings.members.find((m) => m.membershipId === ctx.membershipId)
    : undefined;

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
  const maxTeamPoints = Math.max(1, ...teams.map((t) => t.points));

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_372px]">
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
              <DisplayNumber className="mt-2 text-[56px] text-white sm:text-[76px]">
                Leaderboard
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

      {/* Rail */}
      <div className="flex flex-col gap-4">
        {mvp && (
          <Link
            href="/leaderboard"
            className="relative block overflow-hidden rounded-[22px] p-6"
            style={{
              background: "linear-gradient(135deg,#FB923C 0%,#EA580C 100%)",
              boxShadow: "0 20px 34px -20px rgba(234,88,12,.75)",
            }}
          >
            <div
              aria-hidden
              className="animate-sweep absolute inset-y-0 w-20"
              style={{
                background:
                  "linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent)",
              }}
            />
            <div className="relative text-[10.5px] font-extrabold tracking-[0.22em] text-white/85">
              WEEK {standings.weekNo} MVP
            </div>
            <div className="relative mt-4 flex items-center gap-4">
              <div className="font-display text-accent-dark flex size-[70px] items-center justify-center rounded-[20px] bg-white/95 text-[28px] font-extrabold">
                {mvp.initials}
              </div>
              <div className="min-w-0">
                <DisplayNumber className="truncate text-[34px] text-white">
                  {mvp.name}
                </DisplayNumber>
                <div className="mt-1 truncate text-[11.5px] font-extrabold tracking-[0.1em] text-white/80">
                  {mvp.teamName}
                  {mvp.position ? ` · ${mvp.position}` : ""}
                </div>
              </div>
            </div>
            <div className="relative mt-5 grid grid-cols-3 gap-2.5">
              <StatTile tone="onColor" label="Pts" value={fmt.total(mvp.score)} />
              <StatTile
                tone="onColor"
                label="Att"
                value={fmt.pct(
                  mvp.breakdown.find((b) => b.key === "attendance")?.value ?? 0,
                )}
              />
              <StatTile tone="onColor" label="Strk" value={`🔥${mvp.streak}`} />
            </div>
          </Link>
        )}

        <Card>
          <div className="flex items-center justify-between">
            <Eyebrow>Team standings</Eyebrow>
            <Link href="/teams" className="text-accent text-[11px] font-extrabold">
              ALL ›
            </Link>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {teams.map((t) => (
              <li key={t.teamId} className="flex items-center gap-3">
                <DisplayNumber
                  className="w-[18px] text-[18px]"
                  style={{ color: rankColor(t.rank) }}
                >
                  {t.rank}
                </DisplayNumber>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: t.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-ink truncate text-[13px] font-bold">
                    {t.name}
                  </div>
                  <ProgressBar
                    className="mt-1.5"
                    height={5}
                    color={t.color}
                    value={(t.points / maxTeamPoints) * 100}
                  />
                </div>
                <DisplayNumber className="text-ink text-[19px]">
                  {fmt.points(t.points)}
                </DisplayNumber>
              </li>
            ))}
          </ul>
        </Card>

        {own && (
          <div className="border-accent-line bg-accent-tint rounded-[20px] border p-6">
            <div className="text-[10.5px] font-extrabold tracking-[0.16em] text-[#A97A4E] uppercase">
              Your streak
            </div>
            <div className="mt-2.5 flex items-baseline gap-2.5">
              <span className="animate-flicker text-[30px]">🔥</span>
              <DisplayNumber className="text-accent text-[52px]">
                {own.streak}
              </DisplayNumber>
              <span className="text-[12.5px] font-bold text-[#8A7566]">
                sessions perfect
              </span>
            </div>
            <Link
              href="/leaderboard"
              className="text-accent-dark mt-4 inline-block text-[11.5px] font-extrabold tracking-[0.08em]"
            >
              VIEW LEADERBOARD ›
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
