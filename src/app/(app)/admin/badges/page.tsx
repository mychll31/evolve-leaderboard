import { asc, eq } from "drizzle-orm";
import { BadgesManager } from "@/components/admin/BadgesManager";
import { RollupPanel } from "@/components/admin/RollupPanel";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { badges, memberBadges } from "@/db/schema";

export default async function AdminBadgesPage() {
  const ctx = await getAppContext();
  const db = getDb();

  const [rows, awarded] = await Promise.all([
    db.select().from(badges).orderBy(asc(badges.sortOrder)),
    db.select({ badgeId: memberBadges.badgeId }).from(memberBadges),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <RollupPanel
        seasonId={ctx.standings.season.id}
        seasonName={ctx.standings.season.name}
        weekNo={ctx.standings.weekNo}
      />
      <BadgesManager
        badges={rows.map((badge) => ({
          id: badge.id,
          icon: badge.icon,
          name: badge.name,
          requirementText: badge.requirementText,
          ruleJson: badge.ruleJson,
          active: badge.active,
          holders: awarded.filter((a) => a.badgeId === badge.id).length,
        }))}
        metrics={ctx.standings.metrics.map((m) => ({
          key: m.key,
          name: m.name,
        }))}
      />
    </div>
  );
}
