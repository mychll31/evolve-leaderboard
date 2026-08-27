"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@/components/ui";
import type { MemberStanding } from "@/db/queries/standings";
import { TopPerformers } from "./TopPerformers";

type TeamChip = { id: string; name: string; color: string };
type MetricColumn = { key: string; name: string };

/** Row pitch for the standings rows, in px. */
const ROW_H = 76;

/**
 * Multi-team filter.
 *
 * A native `<select multiple>` means ctrl-clicking on a desktop and a scroll
 * box that cannot be styled, so this is a plain popover of checkboxes: the
 * behaviour a Select2-style control gives, without adding jQuery to a React
 * app. An empty selection means every team, so the board opens complete.
 */
function TeamFilter({
  teams,
  selected,
  onChange,
}: {
  teams: TeamChip[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chosen = teams.filter((t) => selected.includes(t.id));
  const label =
    chosen.length === 0
      ? "All teams"
      : chosen.length === 1
        ? chosen[0].name
        : `${chosen[0].name} +${chosen.length - 1}`;

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );

  return (
    <div ref={wrapper} className="relative min-w-0 flex-1 sm:max-w-[320px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="border-line bg-card text-ink hover:border-primary focus-visible:ring-primary/30 flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {chosen.length > 0 && (
          <span className="bg-primary-tint text-primary-dark shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold">
            {chosen.length}
          </span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ink-3)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter by team"
          className="border-line absolute top-[calc(100%+8px)] left-0 z-40 max-h-[320px] w-full overflow-y-auto rounded-[16px] border bg-white p-2 shadow-[0_18px_40px_-20px_rgba(15,23,32,.45)]"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={clsx(
              "hover:bg-surface-2 w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-[13px] font-bold transition-colors",
              chosen.length === 0 ? "text-primary-dark" : "text-ink-2",
            )}
          >
            All teams
          </button>

          <div className="border-line-2 mt-1 border-t pt-1">
            {teams.map((team) => {
              const active = selected.includes(team.id);
              return (
                <label
                  key={team.id}
                  className="hover:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={active}
                    onChange={() => toggle(team.id)}
                  />
                  <span
                    aria-hidden
                    className="peer-focus-visible:ring-primary/40 grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2 peer-focus-visible:ring-2"
                    style={{
                      borderColor: active ? team.color : "var(--color-line)",
                      background: active ? team.color : "#FFFFFF",
                    }}
                  >
                    {active && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                  <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">
                    {team.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function LeaderboardClient({
  members,
  teams,
  metrics,
}: {
  members: MemberStanding[];
  teams: TeamChip[];
  metrics: MetricColumn[];
}) {
  // Empty means every team, so the board opens showing the whole season.
  const [teamIds, setTeamIds] = useState<string[]>([]);

  const rows = useMemo(() => {
    const filtered =
      teamIds.length > 0
        ? members.filter((m) => teamIds.includes(m.teamId))
        : members;
    return [...filtered].sort((a, b) => a.rank - b.rank);
  }, [members, teamIds]);

  const maxScore = Math.max(1, ...members.map((m) => m.score));
  const rankedRows = rows.filter((member) => member.score > 0);

  const chosenTeams = teams.filter((t) => teamIds.includes(t.id));
  const scopeLabel =
    chosenTeams.length === 0
      ? "all teams"
      : chosenTeams.map((t) => t.name).join(", ");

  return (
    <div className="flex flex-col gap-5">
      {rankedRows.length > 0 && <TopPerformers members={rankedRows} />}

      {/* Team filter — the only control on the board. A dropdown rather than
          chips: ten teams wrapped onto four rows and pushed the standings
          themselves below the fold. */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ink-3 text-[10px] font-extrabold tracking-[0.14em] uppercase">
            Teams
          </span>
          <TeamFilter teams={teams} selected={teamIds} onChange={setTeamIds} />
        </div>
      </Card>

      {/* States what you are actually looking at, which chips alone do not. */}
      {rows.length > 0 && (
        <p className="text-ink-3 -mt-1 text-[12px] font-bold tracking-[0.04em]">
          {rows.length} {rows.length === 1 ? "person" : "people"} · {scopeLabel}
        </p>
      )}

      {rows.length === 0 && (
        <Card className="text-center">
          <p className="text-ink-2 text-[14px] font-semibold">
            Nobody is on{" "}
            {chosenTeams.length === 1 ? "this team" : "these teams"} yet.
          </p>
        </Card>
      )}

      {/* Absolutely positioned rows that slide when the order changes. This
          animated shuffle is the design's signature moment. */}
      {rows.length > 0 && (
        <>
          <div
            className="relative hidden lg:block"
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
                    style={{
                      color:
                        p.score > 0 ? rankColor(p.rank) : "var(--color-ink-4)",
                    }}
                  >
                    {p.score > 0 ? p.rank : "-"}
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
                      {/* Why the score is lower than the work suggests. The
                          number itself is already net, so without this the
                          board silently disagrees with the breakdown. */}
                      {p.penaltyPoints > 0 && (
                        <span className="text-negative ml-1.5 font-extrabold">
                          −{fmt.penalty(p.penaltyPoints)} pts
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 px-6">
                    <ProgressBar gradient value={(p.score / maxScore) * 100} />
                  </div>
                  <div className="w-[88px] shrink-0 text-right">
                    <Eyebrow className="text-ink-4">Done</Eyebrow>
                    <div className="text-ink-2 text-[15px] font-bold">
                      {p.breakdown.filter((b) => b.value > 0).length}/
                      {metrics.length}
                    </div>
                  </div>
                  <div className="w-[88px] shrink-0 text-right">
                    <Eyebrow className="text-ink-4">Streak</Eyebrow>
                    <div className="text-accent text-[15px] font-extrabold">
                      🔥{p.streak}
                    </div>
                  </div>
                  <div className="w-[104px] shrink-0 text-right">
                    <Eyebrow className="text-ink-4">Total points</Eyebrow>
                    <DisplayNumber className="text-ink text-[27px]">
                      {fmt.activityPoints(p.activityPoints)}
                    </DisplayNumber>
                  </div>
                  <div className="w-[96px] shrink-0 text-right">
                    <Eyebrow className="text-ink-4">Score</Eyebrow>
                    <DisplayNumber className="text-ink text-[27px]">
                      {fmt.total(p.score)}
                    </DisplayNumber>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Phone: same data, compact rows, no absolute positioning. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.map((p) => (
              <li
                key={p.membershipId}
                className="border-line bg-card flex items-center gap-2 overflow-hidden rounded-2xl border py-3 pr-3 sm:gap-3 sm:pr-4"
              >
                <div
                  aria-hidden
                  className="h-11 w-[6px] shrink-0 rounded-r"
                  style={{ background: p.teamColor }}
                />
                <DisplayNumber
                  className="w-7 shrink-0 text-center text-[22px]"
                  style={{
                    color:
                      p.score > 0 ? rankColor(p.rank) : "var(--color-ink-4)",
                  }}
                >
                  {p.score > 0 ? p.rank : "-"}
                </DisplayNumber>
                <div className="min-w-0 flex-1">
                  <div className="text-ink truncate text-[14.5px] font-extrabold">
                    {p.name}
                  </div>
                  <div className="text-ink-3 truncate text-[11px] font-semibold">
                    {p.teamName} · 🔥{p.streak}
                    {p.penaltyPoints > 0 && (
                      <span className="text-negative ml-1.5 font-extrabold">
                        −{fmt.penalty(p.penaltyPoints)} pts
                      </span>
                    )}
                  </div>
                </div>
                <Delta value={p.delta} />
                <div className="grid w-[148px] shrink-0 grid-cols-2 gap-2 text-right">
                  <div>
                    <div className="text-ink-4 text-[8.5px] leading-none font-extrabold tracking-[0.06em] uppercase">
                      Points
                    </div>
                    <DisplayNumber className="text-ink mt-1 text-[22px]">
                      {fmt.activityPoints(p.activityPoints)}
                    </DisplayNumber>
                  </div>
                  <div>
                    <div className="text-ink-4 text-[8.5px] leading-none font-extrabold tracking-[0.06em] uppercase">
                      Score
                    </div>
                    <DisplayNumber className="text-ink mt-1 text-[22px]">
                      {fmt.total(p.score)}
                    </DisplayNumber>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
