import {
  Card,
  Delta,
  DisplayNumber,
  Eyebrow,
  SectionTitle,
  fmt,
} from "@/components/ui";
import { getDb } from "@/db/client";
import { getAnalytics } from "@/db/queries/gamification";
import type { Standings } from "@/db/queries/standings";

const SERIES_COLORS = ["#12B5CB", "#F97316", "#7C3AED", "#16A34A", "#E11D48"];

export async function AnalyticsPanel({ standings }: { standings: Standings }) {
  const analytics = await getAnalytics(getDb(), standings.season.id);

  const metricNames = standings.metrics.map((m) => ({
    key: m.key,
    name: m.name,
  }));

  const maxAverage = Math.max(100, ...analytics.weeks.map((w) => w.averageScore));

  const first = analytics.weeks[0];
  const last = analytics.weeks[analytics.weeks.length - 1];
  const swing = first && last ? last.averageScore - first.averageScore : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="py-4">
          <Eyebrow>Weeks tracked</Eyebrow>
          <DisplayNumber className="text-ink mt-0.5 text-[34px]">
            {analytics.weeks.length}
          </DisplayNumber>
        </Card>
        <Card className="py-4">
          <Eyebrow>Season average</Eyebrow>
          <DisplayNumber className="text-ink mt-0.5 text-[34px]">
            {last ? fmt.total(last.averageScore) : "—"}
          </DisplayNumber>
        </Card>
        <Card className="py-4">
          <Eyebrow>Swing since week 1</Eyebrow>
          <DisplayNumber
            className={`mt-0.5 text-[34px] ${swing >= 0 ? "text-positive" : "text-negative"}`}
          >
            {swing >= 0 ? "+" : ""}
            {swing.toFixed(1)}
          </DisplayNumber>
        </Card>
      </div>

      <Card>
        <SectionTitle>SEASON AVERAGE BY WEEK</SectionTitle>
        {analytics.weeks.length === 0 ? (
          <p className="text-ink-2 mt-4 text-[14px] font-semibold">
            No weekly snapshots yet. Run the weekly rollup from the admin
            console to start building history.
          </p>
        ) : (
          <div className="mt-5 flex h-[180px] items-end gap-2 sm:gap-3">
            {analytics.weeks.map((week) => (
              <div
                key={week.weekNo}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              >
                <div className="text-ink-2 text-[11px] font-extrabold">
                  {week.averageScore.toFixed(1)}
                </div>
                <div
                  className="w-full rounded-t-[7px] transition-[height] duration-500"
                  style={{
                    height: `${Math.max(4, (week.averageScore / maxAverage) * 100)}%`,
                    background: "linear-gradient(180deg,#5FD3E0,#12B5CB)",
                  }}
                />
                <div className="text-ink-4 text-[10px] font-bold">
                  W{week.weekNo}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>METRIC TRENDS</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Averages taken from each week&rsquo;s stored snapshot.
        </p>

        {analytics.weeks.length === 0 ? (
          <p className="text-ink-2 mt-4 text-[14px] font-semibold">
            Nothing to chart yet.
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-5">
            {metricNames.map((metric, index) => {
              const color = SERIES_COLORS[index % SERIES_COLORS.length];
              return (
                <div key={metric.key}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink-2 text-[12.5px] font-extrabold">
                      {metric.name}
                    </span>
                    <span className="text-ink-3 text-[12px] font-bold">
                      {last?.metrics[metric.key] !== undefined
                        ? fmt.pct(last.metrics[metric.key])
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex h-[52px] items-end gap-1">
                    {analytics.weeks.map((week) => {
                      const value = week.metrics[metric.key] ?? 0;
                      return (
                        <div
                          key={week.weekNo}
                          title={`Week ${week.weekNo}: ${value.toFixed(1)}%`}
                          className="flex-1 rounded-t-[4px]"
                          style={{
                            height: `${Math.max(4, value)}%`,
                            background: color,
                            opacity: 0.35 + (value / 100) * 0.65,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>BIGGEST MOVERS</SectionTitle>
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            Week {analytics.latestWeek || "—"}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {analytics.movers.map((mover) => (
              <li key={mover.membershipId} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="h-6 w-2 shrink-0 rounded-[3px]"
                  style={{ background: mover.teamColor }}
                />
                <span className="text-ink-2 min-w-0 flex-1 truncate text-[13px] font-bold">
                  {mover.name}
                </span>
                <Delta value={mover.delta} />
                <DisplayNumber className="text-ink w-12 text-right text-[20px]">
                  {fmt.total(mover.score)}
                </DisplayNumber>
              </li>
            ))}
            {analytics.movers.length === 0 && (
              <li className="text-ink-3 text-[13px] font-semibold">
                Nobody climbed this week.
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <SectionTitle>LOSING GROUND</SectionTitle>
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            Week {analytics.latestWeek || "—"}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {analytics.fallers.map((faller) => (
              <li key={faller.membershipId} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="h-6 w-2 shrink-0 rounded-[3px]"
                  style={{ background: faller.teamColor }}
                />
                <span className="text-ink-2 min-w-0 flex-1 truncate text-[13px] font-bold">
                  {faller.name}
                </span>
                <Delta value={faller.delta} />
                <DisplayNumber className="text-ink w-12 text-right text-[20px]">
                  {fmt.total(faller.score)}
                </DisplayNumber>
              </li>
            ))}
            {analytics.fallers.length === 0 && (
              <li className="text-ink-3 text-[13px] font-semibold">
                Nobody dropped this week.
              </li>
            )}
          </ul>
        </Card>
      </div>

    </div>
  );
}
