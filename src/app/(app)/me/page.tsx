import { and, desc, eq, gt } from "drizzle-orm";
import { Card, SectionTitle, fmt } from "@/components/ui";
import { FlipCard, type LogRow } from "@/components/me/FlipCard";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { metricEntries, metrics, scoreSnapshots } from "@/db/schema";
import { dailyAffirmation } from "@/lib/affirmation";

function formatLoggedAt(date: Date | null): string {
  if (!date) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function MePage() {
  const ctx = await getAppContext();
  const db = getDb();

  const member = ctx.membershipId
    ? ctx.standings.members.find((m) => m.membershipId === ctx.membershipId)
    : undefined;

  if (!member) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Card className="text-center">
          <div className="text-[36px]">🧢</div>
          <SectionTitle className="mt-2">NO PLAYER CARD</SectionTitle>
          <p className="text-ink-2 mt-3 text-[14px] leading-relaxed">
            {ctx.coachedTeams.length > 0
              ? `You lead ${ctx.coachedTeams.map((t) => t.name).join(", ")}. Leaders are not scored, so there is no player card.`
              : "You are not on a team for this season yet. Ask an admin to add you."}
          </p>
        </Card>
      </div>
    );
  }

  const [history, latestLog] = await Promise.all([
    db
      .select()
      .from(scoreSnapshots)
      .where(eq(scoreSnapshots.membershipId, member.membershipId)),
    db
      .select({ recordedAt: metricEntries.recordedAt })
      .from(metricEntries)
      .innerJoin(metrics, eq(metrics.id, metricEntries.metricId))
      .where(
        and(
          eq(metricEntries.membershipId, member.membershipId),
          eq(metricEntries.status, "approved"),
          gt(metricEntries.value, 0),
          eq(metrics.seasonId, ctx.standings.season.id),
          eq(metrics.active, true),
        ),
      )
      .orderBy(desc(metricEntries.recordedAt))
      .limit(1),
  ]);

  const loggedCount = member.breakdown.filter((part) => part.value > 0).length;
  const scoredHistory = history.filter((row) => row.score > 0);
  const bestRank = scoredHistory.length
    ? Math.min(...scoredHistory.map((h) => h.rank))
    : member.score > 0
      ? member.rank
      : null;

  const log: LogRow[] = [
    { label: "Score", value: fmt.total(member.score), tone: "accent" },
    { label: "Logged", value: `${loggedCount}/${member.breakdown.length}` },
    { label: "Team", value: member.teamName, kind: "text" },
    {
      label: "Last logged",
      value: formatLoggedAt(latestLog[0]?.recordedAt ?? null),
      kind: "text",
    },
    { label: "Best rank", value: bestRank ? `#${bestRank}` : "-" },
    { label: "Weeks tracked", value: `${history.length}` },
  ];
  const affirmation = dailyAffirmation({
    name: member.name,
    teamName: member.teamName,
    score: member.score,
    loggedCount,
    totalMetrics: member.breakdown.length,
  });

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <FlipCard
        member={member}
        log={log}
        affirmation={affirmation}
      />
      <p className="text-ink-3 mt-2.5 text-center text-[11.5px] font-semibold">
        Tap the card to flip · {ctx.standings.season.name}
      </p>
    </div>
  );
}
