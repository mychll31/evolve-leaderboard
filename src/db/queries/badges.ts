import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { badges, memberBadges } from "@/db/schema";

export type BadgeView = {
  id: string;
  key: string;
  icon: string;
  name: string;
  requirementText: string;
  owned: boolean;
};

/**
 * The badge cabinet: every active badge, flagged with whether this membership
 * has earned it. Awards are seeded rows in Build 1 — the rule engine that
 * grants them arrives in Build 3.
 */
export async function getBadges(
  db: Database,
  membershipId: string | null,
): Promise<BadgeView[]> {
  const [catalogue, owned] = await Promise.all([
    db
      .select()
      .from(badges)
      .where(eq(badges.active, true))
      .orderBy(badges.sortOrder),
    membershipId
      ? db
          .select({ badgeId: memberBadges.badgeId })
          .from(memberBadges)
          .where(eq(memberBadges.membershipId, membershipId))
      : Promise.resolve([] as { badgeId: string }[]),
  ]);

  const ownedIds = new Set(owned.map((o) => o.badgeId));

  return catalogue.map((b) => ({
    id: b.id,
    key: b.key,
    icon: b.icon,
    name: b.name,
    requirementText: b.requirementText,
    owned: ownedIds.has(b.id),
  }));
}
