import { eq } from "drizzle-orm";
import { Card, SectionTitle, fmt } from "@/components/ui";
import { FlipCard, type LogRow } from "@/components/me/FlipCard";
import { getDb } from "@/db/client";
import { getBadges } from "@/db/queries/badges";
import { getAppContext } from "@/db/queries/context";
import { scoreSnapshots } from "@/db/schema";

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

  const [badges, history] = await Promise.all([
    getBadges(db, member.membershipId),
    db
      .select()
      .from(scoreSnapshots)
      .where(eq(scoreSnapshots.membershipId, member.membershipId)),
  ]);

  const bestRank = history.length
    ? Math.min(...history.map((h) => h.rank))
    : member.rank;

  const log: LogRow[] = [
    { label: "Current streak", value: `${member.streak}`, tone: "accent" },
    { label: "Best rank", value: `#${bestRank}` },
    { label: "Badges earned", value: `${badges.filter((b) => b.owned).length}` },
    { label: "Weeks tracked", value: `${history.length}` },
  ];

  // Only when there is one: a permanent "Minus points: 0" row would read as a
  // warning to everybody who has never been docked.
  if (member.penaltyPoints > 0) {
    log.push({
      label: "Minus points",
      value: `−${fmt.penalty(member.penaltyPoints)}`,
      tone: "negative",
    });
  }

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <FlipCard member={member} log={log} badges={badges} />
      <p className="text-ink-3 mt-2.5 text-center text-[11.5px] font-semibold">
        Tap the card to flip · {ctx.standings.season.name}
      </p>
    </div>
  );
}
