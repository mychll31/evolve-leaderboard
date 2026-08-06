"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  Avatar,
  Card,
  Delta,
  DisplayNumber,
  Eyebrow,
  ProgressBar,
  fmt,
  rankColor,
  StatTile,
} from "@/components/ui";
import type { MemberStanding } from "@/db/queries/standings";

type TeamChip = { id: string; name: string; color: string };
type MetricColumn = { key: string; name: string };

const LAYOUTS = [
  { id: "broadcast", label: "Broadcast" },
  { id: "podium", label: "Podium" },
  { id: "statsheet", label: "Stat sheet" },
] as const;
type LayoutId = (typeof LAYOUTS)[number]["id"];

/** Row pitch for the Broadcast layout, in px, per breakpoint. */
const ROW_H = 76;

export function LeaderboardClient({
  members,
  teams,
  metrics,
}: {
  members: MemberStanding[];
  teams: TeamChip[];
  metrics: MetricColumn[];
}) {
  const [layout, setLayout] = useState<LayoutId>("broadcast");
  const [sort, setSort] = useState<string>("pts");
  const [teamId, setTeamId] = useState<string | null>(null);

  const sortOptions = useMemo(
    () => [{ key: "pts", label: "PTS" }, ...metrics.map((m) => ({ key: m.key, label: m.name.slice(0, 3).toUpperCase() })), { key: "streak", label: "STREAK" }],
    [metrics],
  );

  const rows = useMemo(() => {
    const filtered = teamId
      ? members.filter((m) => m.teamId === teamId)
      : members;
    const valueOf = (m: MemberStanding, key: string) =>
      key === "pts"
        ? m.score
        : key === "streak"
          ? m.streak
          : (m.breakdown.find((b) => b.key === key)?.value ?? 0);

    return [...filtered].sort(
      (a, b) => valueOf(b, sort) - valueOf(a, sort) || a.rank - b.rank,
    );
  }, [members, teamId, sort]);

  const maxScore = Math.max(1, ...members.map((m) => m.score));

  const leader = rows[0];
  const activeTeam = teams.find((t) => t.id === teamId) ?? null;
  const averageScore =
    rows.length > 0 ? rows.reduce((s, m) => s + m.score, 0) / rows.length : 0;
  const bestStreak = rows.reduce((best, m) => Math.max(best, m.streak), 0);
  const sortLabel = sortOptions.find((s) => s.key === sort)?.label ?? "PTS";

  return (
    <div>
      {/* Leader banner. The page used to open straight onto three rows of
          chips with no focal point. Follows the current filter, so narrowing
          to one team shows that team's leader. */}
      {leader && (
        <div
          className="relative overflow-hidden rounded-[22px] p-6 sm:p-7"
          style={{
            background: `linear-gradient(112deg, ${leader.teamColor} 0%, #0F1720 118%)`,
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
                {activeTeam ? `${activeTeam.name} · leader` : "Season leader"}
              </div>
              <div className="mt-3 flex items-center gap-4">
                <div className="font-display flex size-[62px] shrink-0 items-center justify-center rounded-[18px] bg-white/95 text-[24px] font-extrabold text-[#0F1720] sm:size-[70px] sm:text-[28px]">
                  {leader.initials}
                </div>
                <div className="min-w-0">
                  <DisplayNumber className="truncate text-[40px] text-white sm:text-[52px]">
                    {leader.name}
                  </DisplayNumber>
                  <div className="mt-1 truncate text-[11.5px] font-extrabold tracking-[0.1em] text-white/75 uppercase">
                    {leader.teamName}
                    {leader.position ? ` · ${leader.position}` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <StatTile tone="onColor" label="Pts" value={fmt.score(leader.score)} />
              <StatTile tone="onColor" label="Avg" value={fmt.score(averageScore)} />
              <StatTile tone="onColor" label="Top streak" value={`🔥${bestStreak}`} />
            </div>
          </div>
        </div>
      )}

      {/* Controls, gathered onto one surface rather than floating loose. */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Leaderboard layout"
            className="border-line bg-surface flex gap-1 rounded-xl border p-1"
          >
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={layout === l.id}
                onClick={() => setLayout(l.id)}
                className={clsx(
                  "cursor-pointer rounded-[9px] px-3 py-2 text-[11.5px] font-extrabold tracking-[0.08em] uppercase transition-colors sm:px-5",
                  layout === l.id
                    ? "bg-primary text-white"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
            <Eyebrow className="mr-1">Sort</Eyebrow>
            {sortOptions.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={clsx(
                  "cursor-pointer rounded-[9px] px-3 py-1.5 text-[11.5px] font-extrabold tracking-[0.06em] transition-colors",
                  sort === s.key
                    ? "bg-primary text-white"
                    : "border-line bg-card text-ink-2 hover:bg-surface-2 border",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-line-2 mt-4 flex flex-wrap gap-2 border-t pt-4">
          {[{ id: null, name: "All teams", color: "#12B5CB" }, ...teams].map(
            (chip) => {
              const active = teamId === chip.id;
              return (
                <button
                  key={chip.id ?? "all"}
                  onClick={() => setTeamId(chip.id)}
                  aria-pressed={active}
                  className="cursor-pointer rounded-full border px-3.5 py-2 text-[12px] font-bold whitespace-nowrap transition-colors"
                  style={{
                    background: active ? chip.color : "#FFFFFF",
                    color: active ? "#FFFFFF" : "var(--color-ink-2)",
                    borderColor: active ? chip.color : "var(--color-line)",
                  }}
                >
                  {chip.name}
                </button>
              );
            },
          )}
        </div>
      </Card>

      {/* States what you are actually looking at, which chips alone do not. */}
      {rows.length > 0 && (
        <p className="text-ink-3 mt-4 text-[12px] font-bold tracking-[0.04em]">
          {rows.length} player{rows.length === 1 ? "" : "s"}
          {activeTeam ? ` · ${activeTeam.name}` : " · all teams"} · sorted by{" "}
          {sortLabel.toLowerCase()}
        </p>
      )}

      {rows.length === 0 && (
        <Card className="mt-5 text-center">
          <p className="text-ink-2 text-[14px] font-semibold">
            No players on this team yet.
          </p>
        </Card>
      )}

      {/* Broadcast — absolutely positioned rows that slide when the order
          changes. This animated shuffle is the design's signature moment. */}
      {layout === "broadcast" && rows.length > 0 && (
        <>
          <div
            className="relative mt-5 hidden lg:block"
            style={{ height: rows.length * ROW_H }}
          >
            {rows.map((p, i) => (
              <div
                key={p.membershipId}
                className="absolute inset-x-0 top-0 h-[66px] transition-transform duration-[650ms]"
                style={{
                  transform: `translateY(${i * ROW_H}px)`,
                  transitionTimingFunction: "cubic-bezier(.2,.85,.25,1)",
                }}
              >
                <div className="border-line bg-card flex h-[66px] items-center overflow-hidden rounded-2xl border pr-6">
                  <div
                    aria-hidden
                    className="h-full w-[7px] shrink-0"
                    style={{ background: p.teamColor }}
                  />
                  <DisplayNumber
                    className="w-16 shrink-0 text-center text-[30px]"
                    style={{ color: rankColor(p.rank) }}
                  >
                    {p.rank}
                  </DisplayNumber>
                  <Delta value={p.delta} className="w-8 shrink-0" />
                  <Avatar
                    initials={p.initials}
                    color={p.teamColor}
                    size={42}
                    className="mr-4"
                  />
                  <div className="w-[220px] shrink-0">
                    <div className="text-ink truncate text-[16px] font-extrabold">
                      {p.name}
                    </div>
                    <div className="text-ink-3 truncate text-[11.5px] font-bold tracking-[0.04em]">
                      {p.teamName}
                      {p.position ? ` · ${p.position}` : ""}
                    </div>
                  </div>
                  <div className="flex-1 px-6">
                    <ProgressBar gradient value={(p.score / maxScore) * 100} />
                  </div>
                  {metrics.map((m) => (
                    <div key={m.key} className="w-[88px] shrink-0 text-right">
                      <Eyebrow className="text-ink-4">
                        {m.name.slice(0, 3)}
                      </Eyebrow>
                      <div className="text-ink-2 text-[15px] font-bold">
                        {fmt.pct(
                          p.breakdown.find((b) => b.key === m.key)?.value ?? 0,
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="w-[88px] shrink-0 text-right">
                    <Eyebrow className="text-ink-4">Streak</Eyebrow>
                    <div className="text-accent text-[15px] font-extrabold">
                      🔥{p.streak}
                    </div>
                  </div>
                  <div className="w-[92px] shrink-0 text-right">
                    <Eyebrow className="text-ink-4">Pts</Eyebrow>
                    <DisplayNumber className="text-ink text-[30px]">
                      {fmt.score(p.score)}
                    </DisplayNumber>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Phone: same data, compact rows, no absolute positioning. */}
          <ul className="mt-5 flex flex-col gap-2 lg:hidden">
            {rows.map((p) => (
              <li
                key={p.membershipId}
                className="border-line bg-card flex items-center gap-3 overflow-hidden rounded-2xl border py-3 pr-4"
              >
                <div
                  aria-hidden
                  className="h-11 w-[6px] shrink-0 rounded-r"
                  style={{ background: p.teamColor }}
                />
                <DisplayNumber
                  className="w-7 shrink-0 text-center text-[22px]"
                  style={{ color: rankColor(p.rank) }}
                >
                  {p.rank}
                </DisplayNumber>
                <div className="min-w-0 flex-1">
                  <div className="text-ink truncate text-[14.5px] font-extrabold">
                    {p.name}
                  </div>
                  <div className="text-ink-3 truncate text-[11px] font-semibold">
                    {p.teamName} · 🔥{p.streak}
                  </div>
                </div>
                <Delta value={p.delta} />
                <DisplayNumber className="text-ink w-14 text-right text-[24px]">
                  {fmt.score(p.score)}
                </DisplayNumber>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Podium */}
      {layout === "podium" && rows.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-1 items-end gap-5 sm:grid-cols-3">
            {rows.slice(0, 3).map((p, i) => {
              const first = i === 0;
              return (
                <div
                  key={p.membershipId}
                  className="rounded-[22px] border p-6 text-center"
                  style={{
                    marginTop: [0, 26, 40][i],
                    background: first
                      ? "linear-gradient(160deg,#FB923C,#EA580C)"
                      : "#FFFFFF",
                    borderColor: first ? "#EA580C" : "var(--color-line)",
                  }}
                >
                  <div className="text-[30px] leading-none">
                    {["🥇", "🥈", "🥉"][i]}
                  </div>
                  <div
                    className="font-display mx-auto mt-3.5 flex size-[74px] items-center justify-center rounded-[22px] text-[30px] font-extrabold"
                    style={{
                      background: first ? "rgba(255,255,255,.95)" : "#F1F5F8",
                      color: first ? "#EA580C" : "var(--color-ink-2)",
                    }}
                  >
                    {p.initials}
                  </div>
                  <DisplayNumber
                    className="mt-3 text-[32px]"
                    style={{ color: first ? "#FFFFFF" : "var(--color-ink)" }}
                  >
                    {p.name}
                  </DisplayNumber>
                  <div
                    className="mt-1.5 text-[11px] font-extrabold tracking-[0.1em]"
                    style={{
                      color: first ? "rgba(255,255,255,.85)" : p.teamColor,
                    }}
                  >
                    {p.teamName}
                    {p.position ? ` · ${p.position}` : ""}
                  </div>
                  <DisplayNumber
                    className="mt-3 text-[52px]"
                    style={{ color: first ? "#FFFFFF" : "var(--color-ink)" }}
                  >
                    {fmt.score(p.score)}
                  </DisplayNumber>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {rows.slice(3).map((p) => (
              <div
                key={p.membershipId}
                className="border-line bg-card flex items-center gap-3.5 rounded-2xl border px-4 py-3.5"
              >
                <DisplayNumber className="text-ink-3 w-6 text-[22px]">
                  {p.rank}
                </DisplayNumber>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: p.teamColor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-ink truncate text-[14.5px] font-bold">
                    {p.name}
                  </div>
                  <div className="text-ink-3 truncate text-[11px] font-bold">
                    {p.teamName}
                  </div>
                </div>
                <Delta value={p.delta} />
                <DisplayNumber className="text-ink text-[24px]">
                  {fmt.score(p.score)}
                </DisplayNumber>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Stat sheet — one column per active metric, not hardcoded ATT/ASN/QUIZ,
          because metrics are configurable. */}
      {layout === "statsheet" && rows.length > 0 && (
        <div className="border-line bg-card mt-5 overflow-x-auto rounded-[18px] border">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-line bg-surface-2 text-ink-3 border-b text-[10px] font-extrabold tracking-[0.14em] uppercase">
                <th className="w-14 px-6 py-3.5 text-left">Rank</th>
                <th className="w-9" />
                <th className="px-2 py-3.5 text-left">Player</th>
                <th className="w-[150px] px-2 py-3.5 text-left">Team</th>
                <th className="w-20 px-2 py-3.5 text-right">Pts</th>
                {metrics.map((m) => (
                  <th key={m.key} className="w-20 px-2 py-3.5 text-right">
                    {m.name.slice(0, 4)}
                  </th>
                ))}
                <th className="w-24 px-6 py-3.5 text-right">Streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr
                  key={p.membershipId}
                  className="border-line-2 border-b last:border-0"
                  style={{ background: i % 2 ? "#FBFCFE" : "#FFFFFF" }}
                >
                  <td className="px-6 py-3">
                    <DisplayNumber
                      className="text-[22px]"
                      style={{ color: rankColor(p.rank) }}
                    >
                      {p.rank}
                    </DisplayNumber>
                  </td>
                  <td>
                    <Delta value={p.delta} />
                  </td>
                  <td className="text-ink px-2 py-3 text-[14px] font-bold">
                    {p.name}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-[3px]"
                        style={{ background: p.teamColor }}
                      />
                      <span className="text-ink-2 text-[12.5px] font-semibold">
                        {p.teamName}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DisplayNumber className="text-ink text-[22px]">
                      {fmt.score(p.score)}
                    </DisplayNumber>
                  </td>
                  {metrics.map((m) => (
                    <td
                      key={m.key}
                      className="text-ink-2 px-2 py-3 text-right text-[13px] font-bold"
                    >
                      {fmt.pct(
                        p.breakdown.find((b) => b.key === m.key)?.value ?? 0,
                      )}
                    </td>
                  ))}
                  <td className="text-accent px-6 py-3 text-right text-[13px] font-extrabold">
                    🔥{p.streak}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
