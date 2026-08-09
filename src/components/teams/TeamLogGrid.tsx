import Link from "next/link";
import { Card, DisplayNumber, Eyebrow, fmt } from "@/components/ui";
import type { TeamRoster } from "@/db/queries/teams";

/**
 * The team crossed with every metric.
 *
 * A square per metric rather than a column per metric: a season can carry
 * thirty checklist items, and thirty table columns would need scrolling in
 * both directions before anyone could see who is behind. Each square carries
 * the metric name in its tooltip.
 */
export function TeamLogGrid({ roster }: { roster: TeamRoster }) {
  const total = roster.metrics.length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>Who has done what</Eyebrow>
        <span className="text-ink-3 flex items-center gap-3 text-[11px] font-bold">
          <span className="flex items-center gap-1.5">
            <span className="bg-positive inline-block size-3 rounded-[3px]" />
            Done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-line-2 inline-block size-3 rounded-[3px]" />
            Not done
          </span>
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-3.5">
        {roster.members.map((member) => {
          const logged = new Set(member.loggedMetricIds);
          return (
            <li
              key={member.membershipId}
              className="border-line-2 bg-surface-2 rounded-2xl px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="font-display flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
                  style={{ background: roster.color }}
                >
                  {member.initials}
                </span>
                <Link
                  href={`/members/${member.membershipId}`}
                  className="text-ink hover:text-primary min-w-0 flex-1 truncate text-[14px] font-extrabold"
                >
                  {member.name}
                  {member.position ? (
                    <span className="text-ink-3 font-semibold">
                      {" "}
                      · {member.position}
                    </span>
                  ) : null}
                </Link>
                <span
                  className={`shrink-0 text-[12.5px] font-extrabold ${
                    member.loggedCount === total
                      ? "text-positive"
                      : "text-ink-2"
                  }`}
                >
                  {member.loggedCount}/{total}
                </span>
                <DisplayNumber className="text-ink w-16 shrink-0 text-right text-[20px]">
                  {fmt.total(member.score)}
                </DisplayNumber>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {roster.metrics.map((metric) => {
                  const done = logged.has(metric.metricId);
                  return (
                    <span
                      key={metric.metricId}
                      title={`${metric.name} — ${done ? "done" : "not done"}`}
                      className={`inline-block size-[14px] rounded-[4px] ${
                        done ? "bg-positive" : "bg-line-2"
                      }`}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
    </ul>
    </Card>
  );
}
