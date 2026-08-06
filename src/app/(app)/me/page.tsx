import { and, eq } from "drizzle-orm";
import {
  Card,
  DisplayNumber,
  Eyebrow,
  ProgressBar,
  SectionTitle,
  fmt,
} from "@/components/ui";
import { FlipCard, type LogRow } from "@/components/me/FlipCard";
import { getDb } from "@/db/client";
import { getBadges } from "@/db/queries/badges";
import { getAppContext } from "@/db/queries/context";
import { metricEntries, metrics } from "@/db/schema";
import { scoreSnapshots } from "@/db/schema";

export default async function MePage() {
  const ctx = await getAppContext();
  const db = getDb();

  const member = ctx.membershipId
    ? ctx.standings.members.find((m) => m.membershipId === ctx.membershipId)
    : undefined;

  if (!member) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <div className="text-[36px]">🧢</div>
        <SectionTitle className="mt-2">NO PLAYER CARD</SectionTitle>
        <p className="text-ink-2 mt-3 text-[14px] leading-relaxed">
          {ctx.coachedTeams.length > 0
            ? `You coach ${ctx.coachedTeams.map((t) => t.name).join(", ")} this season. Coaches are not scored, so there is no player card — head to the Coach Desk instead.`
            : "You are not on a team for this season yet. Ask an admin to add you."}
        </p>
      </Card>
    );
  }

  const [attendanceMetric] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(
      and(
        eq(metrics.seasonId, ctx.standings.season.id),
        eq(metrics.key, "attendance"),
      ),
    )
    .limit(1);

  const [badges, attended, history] = await Promise.all([
    getBadges(db, member.membershipId),
    attendanceMetric
      ? db
          .select({ value: metricEntries.value })
          .from(metricEntries)
          .where(
            and(
              eq(metricEntries.membershipId, member.membershipId),
              eq(metricEntries.metricId, attendanceMetric.id),
              eq(metricEntries.status, "approved"),
            ),
          )
      : Promise.resolve([] as { value: number }[]),
    db
      .select()
      .from(scoreSnapshots)
      .where(eq(scoreSnapshots.membershipId, member.membershipId)),
  ]);

  const presentCount = attended.filter((a) => a.value > 0).length;
  const bestRank = history.length
    ? Math.min(...history.map((h) => h.rank))
    : member.rank;

  const log: LogRow[] = [
    { label: "Sessions attended", value: `${presentCount}/${ctx.standings.heldCount}` },
    { label: "Current streak", value: `${member.streak}`, tone: "accent" },
    { label: "Best rank", value: `#${bestRank}` },
    { label: "Badges earned", value: `${badges.filter((b) => b.owned).length}` },
    { label: "Weeks tracked", value: `${history.length}` },
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div>
        <SectionTitle className="text-[30px] tracking-normal sm:text-[38px]">
          MY CARD
        </SectionTitle>
        <p className="text-ink-3 mt-1 text-[12px] font-semibold">
          Tap the card to flip · {ctx.standings.season.name}
        </p>
        <div className="mt-4">
          <FlipCard member={member} log={log} badges={badges} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* The transparency counterpart to the admin metric builder: if admins
            can reweight the formula, members must see why their number moved. */}
        <Card>
          <Eyebrow>Score breakdown</Eyebrow>
          <div className="mt-4 flex flex-col gap-4">
            {member.breakdown.map((part) => (
              <div key={part.key}>
                <div className="flex items-baseline justify-between text-[12.5px] font-bold">
                  <span className="text-ink-2">
                    {part.name}{" "}
                    <span className="text-ink-4">· weight {part.weight}%</span>
                  </span>
                  <span className="text-ink">{fmt.pct(part.value)}</span>
                </div>
                <ProgressBar className="mt-1.5" height={7} gradient value={part.value} />
              </div>
            ))}
          </div>
          <div className="border-line mt-5 flex items-center justify-between border-t pt-4">
            <span className="text-ink-2 text-[12px] font-extrabold tracking-[0.1em] uppercase">
              Total · {ctx.standings.season.formula}
            </span>
            <DisplayNumber className="text-ink text-[32px]">
              {fmt.score(member.score)}
            </DisplayNumber>
          </div>
        </Card>

        <Card>
          <Eyebrow>Badge cabinet</Eyebrow>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className={`rounded-2xl border p-4 ${
                  badge.owned
                    ? "border-accent-line bg-accent-tint"
                    : "border-line bg-card opacity-55"
                }`}
              >
                <div className="text-[24px]">{badge.icon}</div>
                <div className="font-display text-ink mt-2 text-[19px] leading-tight font-bold">
                  {badge.name}
                </div>
                <div className="text-ink-3 mt-1 text-[11px] font-semibold">
                  {badge.requirementText}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
