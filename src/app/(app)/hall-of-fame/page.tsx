import { Card, DisplayNumber, SectionTitle, fmt } from "@/components/ui";
import { getDb } from "@/db/client";
import { getBadges } from "@/db/queries/badges";
import { getAppContext } from "@/db/queries/context";

const MEDALS = ["👑", "🏀", "💎", "🚀", "🛡"];

export default async function HallOfFamePage() {
  const ctx = await getAppContext();
  const badges = await getBadges(getDb(), ctx.membershipId);

  // Legends are the season's leaders. Cross-season history arrives once more
  // than one season has been played.
  const legends = ctx.standings.members.slice(0, 5);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div className="flex flex-col gap-3.5">
        <SectionTitle>LEGENDS</SectionTitle>
        {legends.map((member, i) => (
          <div
            key={member.membershipId}
            className="border-accent-line flex items-center gap-4 rounded-[18px] border p-5"
            style={{
              background: "linear-gradient(110deg,#FFF3E8 0%,#FFFFFF 62%)",
            }}
          >
            <div className="text-[32px]">{MEDALS[i] ?? "🏅"}</div>
            <div className="min-w-0 flex-1">
              <div className="text-accent text-[10.5px] font-extrabold tracking-[0.16em] uppercase">
                {ctx.standings.season.name} · Rank #{member.rank}
              </div>
              <DisplayNumber className="text-ink mt-0.5 text-[26px] sm:text-[30px]">
                {member.name}
              </DisplayNumber>
              <div className="text-ink-3 mt-0.5 truncate text-[12px] font-semibold">
                {member.teamName} · 🔥{member.streak} session streak
              </div>
            </div>
            <DisplayNumber className="text-ink shrink-0 text-[30px] sm:text-[34px]">
              {fmt.score(member.score)}
            </DisplayNumber>
          </div>
        ))}
        {legends.length === 0 && (
          <Card>
            <p className="text-ink-2 text-[14px] font-semibold">
              No results yet this season.
            </p>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <SectionTitle>BADGE CABINET</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={`rounded-[18px] border p-5 ${
                badge.owned
                  ? "border-accent-line bg-accent-tint"
                  : "border-line bg-card opacity-55"
              }`}
            >
              <div className="text-[30px]">{badge.icon}</div>
              <div className="font-display text-ink mt-2.5 text-[21px] leading-tight font-bold tracking-[0.03em] sm:text-[23px]">
                {badge.name}
              </div>
              <div className="text-ink-3 mt-1 text-[11.5px] font-semibold">
                {badge.requirementText}
              </div>
              <div
                className={`mt-2.5 text-[10px] font-extrabold tracking-[0.12em] ${
                  badge.owned ? "text-accent" : "text-ink-4"
                }`}
              >
                {badge.owned ? "UNLOCKED" : "LOCKED"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
