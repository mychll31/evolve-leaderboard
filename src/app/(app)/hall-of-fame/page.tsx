import Link from "next/link";
import {
  Card,
  DisplayNumber,
  Eyebrow,
  SectionTitle,
  fmt,
} from "@/components/ui";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import {
  getBadgeCabinet,
  getLegends,
  listWeeklyAwards,
} from "@/db/queries/gamification";
import { describeBadgeRule, parseBadgeRule } from "@/domain/badges";

const CROWNS = ["👑", "🏀", "💎", "🚀", "🛡"];

export default async function HallOfFamePage() {
  const ctx = await getAppContext();
  const db = getDb();
  const metricNames = Object.fromEntries(
    ctx.standings.metrics.map((m) => [m.key, m.name]),
  );

  const [legends, badges, awards] = await Promise.all([
    getLegends(db),
    getBadgeCabinet(db, ctx.membershipId),
    listWeeklyAwards(db, ctx.standings.season.id, metricNames),
  ]);

  // Group the MVP roll by week, newest first.
  const byWeek = new Map<number, typeof awards>();
  for (const award of awards) {
    const list = byWeek.get(award.weekNo) ?? [];
    list.push(award);
    byWeek.set(award.weekNo, list);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex flex-col gap-3.5">
          <div>
            <SectionTitle>LEGENDS</SectionTitle>
            <p className="text-ink-3 mt-1 text-[12px] font-semibold">
              Champions of every season Leaderboard has run.
            </p>
          </div>

          {legends.map((legend, i) => (
            <div
              key={legend.seasonId}
              className="border-accent-line flex items-center gap-4 rounded-[18px] border p-5"
              style={{
                background: "linear-gradient(110deg,#FFF3E8 0%,#FFFFFF 62%)",
              }}
            >
              <div className="text-[32px]">{CROWNS[i] ?? "🏅"}</div>
              <div className="min-w-0 flex-1">
                <div className="text-accent text-[10.5px] font-extrabold tracking-[0.16em] uppercase">
                  {legend.seasonName}
                  {legend.seasonStatus === "active" && " · in progress"}
                </div>
                <Link
                  href={`/members/${legend.membershipId}`}
                  className="hover:text-accent-dark block"
                >
                  <DisplayNumber className="text-ink mt-0.5 text-[26px] sm:text-[30px]">
                    {legend.name}
                  </DisplayNumber>
                </Link>
                <div className="text-ink-3 mt-0.5 truncate text-[12px] font-semibold">
                  {legend.teamName}
                  {legend.mvpWeeks > 0 &&
                    ` · ${legend.mvpWeeks}× weekly MVP`}
                </div>
              </div>
              <DisplayNumber className="text-ink shrink-0 text-[30px] sm:text-[34px]">
                {fmt.score(legend.score)}
              </DisplayNumber>
            </div>
          ))}

          {legends.length === 0 && (
            <Card>
              <p className="text-ink-2 text-[14px] font-semibold">
                No completed weeks yet. Champions appear once the weekly rollup
                has run.
              </p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <SectionTitle>BADGE CABINET</SectionTitle>
            <p className="text-ink-3 mt-1 text-[12px] font-semibold">
              Awarded automatically by the weekly rollup.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {badges.map((badge) => {
              const rule = parseBadgeRule(badge.ruleJson);
              return (
                <div
                  key={badge.badgeId}
                  className={`rounded-[18px] border p-5 ${
                    badge.owned
                      ? "border-accent-line bg-accent-tint"
                      : "border-line bg-card opacity-60"
                  }`}
                >
                  <div className="text-[30px]">{badge.icon}</div>
                  <div className="font-display text-ink mt-2.5 text-[21px] leading-tight font-bold tracking-[0.03em] sm:text-[23px]">
                    {badge.name}
                  </div>
                  <div className="text-ink-3 mt-1 text-[11.5px] font-semibold">
                    {rule ? describeBadgeRule(rule) : badge.requirementText}
                  </div>
                  <div className="mt-2.5 flex items-baseline justify-between">
                    <span
                      className={`text-[10px] font-extrabold tracking-[0.12em] ${
                        badge.owned ? "text-accent" : "text-ink-4"
                      }`}
                    >
                      {badge.owned ? "UNLOCKED" : "LOCKED"}
                    </span>
                    <span className="text-ink-4 text-[10.5px] font-bold">
                      {badge.holders} held
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>MVP ROLL</SectionTitle>
        <p className="text-ink-3 mt-1 text-[12px] font-semibold">
          {ctx.standings.season.name}
        </p>

        {weeks.length === 0 ? (
          <Card className="mt-3.5">
            <p className="text-ink-2 text-[14px] font-semibold">
              No weekly awards yet.
            </p>
          </Card>
        ) : (
          <div className="mt-3.5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weeks.map(([weekNo, list]) => (
              <Card key={weekNo}>
                <Eyebrow>Week {weekNo}</Eyebrow>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {list.map((award) => (
                    <li
                      key={award.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-ink-3 text-[10.5px] font-extrabold tracking-[0.1em] uppercase">
                          {award.label}
                        </div>
                        <Link
                          href={`/members/${award.membershipId}`}
                          className="text-ink hover:text-primary block truncate text-[13.5px] font-bold"
                        >
                          {award.name}
                        </Link>
                      </div>
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: award.teamColor }}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
