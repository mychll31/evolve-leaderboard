"use client";

import { useMemo, useState } from "react";
import {
  Avatar,
  Card,
  Delta,
  DisplayNumber,
  Eyebrow,
  ProgressBar,
  fmt,
  rankColor,
} from "@/components/ui";
import type { MemberStanding } from "@/db/queries/standings";

type TeamChip = { id: string; name: string; color: string };
type MetricColumn = { key: string; name: string };

/** Row pitch for the standings rows, in px. */
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
  const [teamId, setTeamId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = teamId
      ? members.filter((m) => m.teamId === teamId)
      : members;
    return [...filtered].sort((a, b) => a.rank - b.rank);
  }, [members, teamId]);

  const maxScore = Math.max(1, ...members.map((m) => m.score));

  const activeTeam = teams.find((t) => t.id === teamId) ?? null;

  return (
    <div>
      {/* Team filter — the only control on the board. */}
      <Card>
        <div className="flex flex-wrap gap-2">
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
          {activeTeam ? ` · ${activeTeam.name}` : " · all teams"}
        </p>
      )}

      {rows.length === 0 && (
        <Card className="mt-5 text-center">
          <p className="text-ink-2 text-[14px] font-semibold">
            No players on this team yet.
          </p>
        </Card>
      )}

      {/* Absolutely positioned rows that slide when the order changes. This
          animated shuffle is the design's signature moment. */}
      {rows.length > 0 && (
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
                      {fmt.total(p.score)}
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
                  {fmt.total(p.score)}
                </DisplayNumber>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
