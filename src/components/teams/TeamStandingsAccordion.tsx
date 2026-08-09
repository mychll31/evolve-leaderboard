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
  detailTeamIds,
  defaultOpenTeamId = null,
}: {
  teams: TeamStanding[];
  leaderPoints: number;
  detailTeamIds: string[];
  defaultOpenTeamId?: string | null;
}) {
  const [openTeamId, setOpenTeamId] = useState<string | null>(defaultOpenTeamId);
  const detailTeamIdSet = new Set(detailTeamIds);
  const singleTeam = teams.length === 1;

  return (
    <div
      className={
        singleTeam
          ? "grid grid-cols-1 gap-4"
          : "grid grid-cols-1 items-start gap-4 xl:grid-cols-2"
      }
    >
      {teams.map((team) => {
        const behind = leaderPoints - team.points;
        const share = leaderPoints > 0 ? (team.points / leaderPoints) * 100 : 0;
        const isLeader = team.rank === 1;
        const canViewDetails = detailTeamIdSet.has(team.teamId);
        const open = canViewDetails && openTeamId === team.teamId;
        const panelId = `team-metrics-${team.teamId}`;
        const summary = (
          <>
            {/* Flex rather than a grid of arbitrary tracks: this row has to
                hold rank, crest, name and score on one line from a phone to a
                desktop, and only the name should ever give up space. */}
            <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
              <DisplayNumber
                className="w-7 shrink-0 text-[26px] sm:w-8 sm:text-[28px]"
                style={{ color: rankColor(team.rank) }}
              >
                {team.rank}
              </DisplayNumber>
              <div
                className="font-display flex size-11 shrink-0 items-center justify-center rounded-[14px] text-[17px] font-extrabold text-white sm:size-12 sm:text-[19px]"
                style={{ background: team.color }}
              >
                {team.abbr}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-ink truncate text-[22px] leading-tight font-bold tracking-[0.03em] sm:text-[27px]">
                  {team.name}
                </div>
                <div className="text-ink-3 truncate text-[11.5px] font-semibold">
                  {team.coachName ? `Leader ${team.coachName} · ` : ""}
                  {team.memberCount} member
                  {team.memberCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <DisplayNumber className="text-ink text-[26px] sm:text-[32px]">
                  {fmt.score(team.points)}%
                </DisplayNumber>
                <Eyebrow className="text-ink-4">Team score</Eyebrow>
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
                {isLeader ? "Top team" : `${fmt.score(behind)}% behind the top team`}
              </span>
              {canViewDetails && (
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
              )}
            </div>
          </>
        );

        return (
          <Card
            key={team.teamId}
            className={[
              isLeader
                ? "border-accent-line min-w-0 overflow-hidden !bg-accent-tint"
                : "min-w-0 overflow-hidden",
              open && !singleTeam ? "xl:col-span-2" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {canViewDetails ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenTeamId(open ? null : team.teamId)}
                className="w-full cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              >
                {summary}
              </button>
            ) : (
              <div>{summary}</div>
            )}

            {/* Always visible, not buried in the panel: the averages say how
                the team is doing, this says who has not logged yet — which is
                the thing a Leader has to act on. */}
            {canViewDetails && (
              <Link
                href={`/teams/${team.teamId}`}
                className="border-line text-ink-2 hover:border-primary hover:text-primary mt-3.5 inline-block rounded-[10px] border bg-white px-3.5 py-2 text-[11px] font-extrabold tracking-[0.08em] uppercase transition-colors"
              >
                See who did what ›
              </Link>
            )}

            {open && (
              <div id={panelId}>
                {team.memberCount === 0 ? (
                  <p className="text-ink-3 mt-4 text-[12.5px] font-semibold">
                    Nobody is on this team yet, so it has no score.
                  </p>
                ) : (
                  <>
                    <div
                      className={
                        singleTeam || open
                          ? "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
                          : "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
                      }
                    >
                      {team.metricAverages.map((metric) => (
                        <div
                          key={metric.key}
                          className="bg-surface-2 rounded-xl px-3.5 py-2.5"
                        >
                          <Eyebrow>{metric.name}</Eyebrow>
                          <DisplayNumber className="text-ink mt-0.5 text-[23px]">
                            {fmt.pct(metric.value)}
                          </DisplayNumber>
                        </div>
                      ))}
                    </div>

                    <div className="border-line-2 mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
                      <TeamPlayer
                        label="Doing best"
                        name={team.topPlayer?.name}
                        membershipId={team.topPlayer?.membershipId}
                        tone="positive"
                      />
                      {team.bottomPlayer && (
                        <TeamPlayer
                          label="Needs help"
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
