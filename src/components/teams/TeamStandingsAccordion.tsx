"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  DisplayNumber,
  Eyebrow,
  fmt,
  rankColor,
} from "@/components/ui";
import type { TeamStanding } from "@/db/queries/teams";

export function TeamStandingsAccordion({
  teams,
  leaderPoints,
}: {
  teams: TeamStanding[];
  leaderPoints: number;
}) {
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {teams.map((team) => {
        const behind = leaderPoints - team.points;
        const share = leaderPoints > 0 ? (team.points / leaderPoints) * 100 : 0;
        const isLeader = team.rank === 1;
        const open = openTeamId === team.teamId;
        const panelId = `team-metrics-${team.teamId}`;

        return (
          <Card
            key={team.teamId}
            className={
              isLeader
                ? "border-accent-line min-w-0 overflow-hidden !bg-accent-tint"
                : "min-w-0 overflow-hidden"
            }
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenTeamId(open ? null : team.teamId)}
              className="w-full cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex sm:gap-3.5">
                <DisplayNumber
                  className="w-8 shrink-0 text-[28px]"
                  style={{ color: rankColor(team.rank) }}
                >
                  {team.rank}
                </DisplayNumber>
                <div
                  className="font-display flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[19px] font-extrabold text-white"
                  style={{ background: team.color }}
                >
                  {team.abbr}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-ink truncate text-[24px] leading-tight font-bold tracking-[0.03em] sm:text-[27px]">
                    {team.name}
                  </div>
                  <div className="text-ink-3 truncate text-[11.5px] font-semibold">
                    {team.coachName ? `Leader ${team.coachName} · ` : ""}
                    {team.memberCount} member
                    {team.memberCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="col-span-3 justify-self-end text-right sm:col-span-1 sm:shrink-0">
                  <DisplayNumber className="text-ink text-[30px] sm:text-[32px]">
                    {fmt.score(team.points)}%
                  </DisplayNumber>
                  <Eyebrow className="text-ink-4">Score</Eyebrow>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="bg-line-2 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.max(2, share)}%`,
                      background: team.color,
                    }}
                  />
                </div>
                <span
                  className={`shrink-0 text-[11px] font-extrabold tracking-[0.06em] uppercase ${
                    isLeader ? "text-accent" : "text-ink-3"
                  }`}
                >
                  {isLeader ? "Leader" : `-${fmt.score(behind)}% behind`}
                </span>
                <span
                  aria-hidden
                  className={`text-ink-3 grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-white transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </div>
            </button>

            {open && (
              <div id={panelId}>
                {team.memberCount === 0 ? (
                  <p className="text-ink-3 mt-4 text-[12.5px] font-semibold">
                    No members yet - this team is not scored.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {team.metricAverages.map((metric) => (
                        <div
                          key={metric.key}
                          className="bg-surface-2 rounded-xl px-3.5 py-2.5"
                        >
                          <Eyebrow>Avg {metric.name}</Eyebrow>
                          <DisplayNumber className="text-ink mt-0.5 text-[23px]">
                            {fmt.pct(metric.value)}
                          </DisplayNumber>
                        </div>
                      ))}
                    </div>

                    <div className="border-line-2 mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
                      <TeamPlayer
                        label="Top"
                        name={team.topPlayer?.name}
                        membershipId={team.topPlayer?.membershipId}
                        tone="positive"
                      />
                      {team.bottomPlayer && (
                        <TeamPlayer
                          label="Needs attention"
                          name={team.bottomPlayer.name}
                          membershipId={team.bottomPlayer.membershipId}
                          tone="negative"
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TeamPlayer({
  label,
  name,
  membershipId,
  tone,
}: {
  label: string;
  name: string | undefined;
  membershipId: string | undefined;
  tone: "positive" | "negative";
}) {
  if (!name) return null;
  return (
    <div className="min-w-0">
      <Eyebrow className={tone === "positive" ? "text-positive" : "text-negative"}>
        {label}
      </Eyebrow>
      {membershipId ? (
        <Link
          href={`/members/${membershipId}`}
          className="text-ink hover:text-primary mt-1 block truncate text-[14px] font-extrabold"
        >
          {name}
        </Link>
      ) : (
        <div className="text-ink mt-1 truncate text-[14px] font-extrabold">
          {name}
        </div>
      )}
    </div>
  );
}
