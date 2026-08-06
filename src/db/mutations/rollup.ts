import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { getStandings, type SeasonRow } from "@/db/queries/standings";
import {
  badges,
  memberBadges,
  memberships,
  metricEntries,
  notifications,
  scoreSnapshots,
  seasons,
  weeklyAwards,
} from "@/db/schema";
import {
  describeAwardCategory,
  selectWeeklyAwards,
  type AwardCandidate,
} from "@/domain/awards";
import {
  evaluateBadgeRule,
  parseBadgeRule,
  type BadgeContext,
} from "@/domain/badges";
import { NotFoundError } from "./guards";

export type RollupResult = {
  weekNo: number;
  members: number;
  snapshots: number;
  badgesAwarded: number;
  awards: number;
  notifications: number;
};

const DAY_MS = 86_400_000;

export function weekNoFor(startsOn: string, on: Date): number {
  const elapsed = Math.round(
    (Date.parse(`${on.toISOString().slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${startsOn}T00:00:00Z`)) /
      DAY_MS,
  );
  return Math.max(1, Math.floor(elapsed / 7) + 1);
}

/**
 * Writes the week's standings snapshot, awards any newly-earned badges, picks
 * the weekly MVPs and raises notifications.
 *
 * **Idempotent by construction.** Snapshots and awards upsert on their unique
 * keys, badge awards skip anything already held, and notifications carry a
 * dedupe key. A duplicated cron, a manual re-run, or a retry after a failure
 * all converge on the same state.
 *
 * That matters more than atomicity here: Turso is libSQL over HTTP, where
 * interactive transactions add failure modes, and a routine that is simply
 * safe to run again is worth more than one that is transactional.
 */
export async function runWeeklyRollup(
  db: Database,
  seasonId: string,
  now: Date = new Date(),
): Promise<RollupResult> {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) throw new NotFoundError("Season");

  const weekNo = weekNoFor(season.startsOn, now);
  const standings = await getStandings(db, season as SeasonRow, now);

  if (standings.members.length === 0) {
    return {
      weekNo,
      members: 0,
      snapshots: 0,
      badgesAwarded: 0,
      awards: 0,
      notifications: 0,
    };
  }

  /* --- 1. Snapshot ---------------------------------------------------- */

  // prevRank comes from the *previous week's* stored snapshot rather than from
  // the live standings delta. Otherwise re-running a week would compare
  // against the snapshot this very run just wrote, and every delta would
  // collapse to zero.
  const previous = await db
    .select({
      membershipId: scoreSnapshots.membershipId,
      rank: scoreSnapshots.rank,
    })
    .from(scoreSnapshots)
    .where(
      and(
        eq(scoreSnapshots.seasonId, seasonId),
        eq(scoreSnapshots.weekNo, weekNo - 1),
      ),
    );
  const prevRankBy = new Map(previous.map((p) => [p.membershipId, p.rank]));

  for (const member of standings.members) {
    const prevRank = prevRankBy.get(member.membershipId) ?? null;
    await db
      .insert(scoreSnapshots)
      .values({
        seasonId,
        membershipId: member.membershipId,
        weekNo,
        score: member.score,
        rank: member.rank,
        prevRank,
        breakdownJson: JSON.stringify(
          member.breakdown.map((b) => ({ key: b.key, value: b.value })),
        ),
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          scoreSnapshots.seasonId,
          scoreSnapshots.membershipId,
          scoreSnapshots.weekNo,
        ],
        set: {
          score: member.score,
          rank: member.rank,
          prevRank,
          computedAt: now,
        },
      });
  }

  /* --- 2. Who improved most ------------------------------------------- */

  const deltas = standings.members.map((member) => {
    const prevRank = prevRankBy.get(member.membershipId);
    return {
      membershipId: member.membershipId,
      delta: prevRank === undefined ? 0 : prevRank - member.rank,
      hasPreviousRank: prevRank !== undefined,
    };
  });
  const bestDelta = Math.max(0, ...deltas.map((d) => (d.hasPreviousRank ? d.delta : 0)));
  const mostImprovedIds = new Set(
    bestDelta > 0
      ? deltas.filter((d) => d.hasPreviousRank && d.delta === bestDelta).map((d) => d.membershipId)
      : [],
  );

  /* --- 3. Badges ------------------------------------------------------- */

  const [badgeRows, held, recordedRows] = await Promise.all([
    db.select().from(badges).where(eq(badges.active, true)),
    db
      .select({
        membershipId: memberBadges.membershipId,
        badgeId: memberBadges.badgeId,
      })
      .from(memberBadges)
      .where(eq(memberBadges.seasonId, seasonId)),
    db
      .select({
        membershipId: metricEntries.membershipId,
        metricId: metricEntries.metricId,
      })
      .from(metricEntries)
      .where(
        and(
          eq(metricEntries.seasonId, seasonId),
          eq(metricEntries.status, "approved"),
        ),
      ),
  ]);

  const heldSet = new Set(held.map((h) => `${h.membershipId}:${h.badgeId}`));
  const metricKeyById = new Map(standings.metrics.map((m) => [m.id, m.key]));
  const recordedBy = new Map<string, Set<string>>();
  for (const row of recordedRows) {
    const key = metricKeyById.get(row.metricId);
    if (!key) continue;
    const set = recordedBy.get(row.membershipId) ?? new Set<string>();
    set.add(key);
    recordedBy.set(row.membershipId, set);
  }

  const newAwards: {
    membershipId: string;
    badgeId: string;
    badgeName: string;
    badgeIcon: string;
  }[] = [];

  for (const member of standings.members) {
    const context: BadgeContext = {
      streak: member.streak,
      rank: member.rank,
      delta: deltas.find((d) => d.membershipId === member.membershipId)?.delta ?? 0,
      metrics: Object.fromEntries(
        member.breakdown.map((b) => [b.key, b.value]),
      ),
      recordedMetrics: [...(recordedBy.get(member.membershipId) ?? [])],
      isMostImproved: mostImprovedIds.has(member.membershipId),
    };

    for (const badge of badgeRows) {
      if (heldSet.has(`${member.membershipId}:${badge.id}`)) continue;
      const rule = parseBadgeRule(badge.ruleJson);
      // A badge with no rule, or one that cannot be parsed, is never awarded
      // automatically — it stays displayable and manually grantable.
      if (!rule) continue;
      if (!evaluateBadgeRule(rule, context)) continue;

      newAwards.push({
        membershipId: member.membershipId,
        badgeId: badge.id,
        badgeName: badge.name,
        badgeIcon: badge.icon,
      });
    }
  }

  for (const award of newAwards) {
    await db
      .insert(memberBadges)
      .values({
        membershipId: award.membershipId,
        badgeId: award.badgeId,
        seasonId,
        awardedAt: now,
      })
      .onConflictDoNothing();
  }

  /* --- 4. Weekly MVPs -------------------------------------------------- */

  const candidates: AwardCandidate[] = standings.members.map((member) => {
    const delta = deltas.find((d) => d.membershipId === member.membershipId);
    return {
      membershipId: member.membershipId,
      name: member.name,
      score: member.score,
      delta: delta?.delta ?? 0,
      hasPreviousRank: delta?.hasPreviousRank ?? false,
      metrics: Object.fromEntries(
        member.breakdown.map((b) => [b.key, b.value]),
      ),
    };
  });

  const selected = selectWeeklyAwards(
    candidates,
    standings.metrics.map((m) => m.key),
  );

  for (const award of selected) {
    await db
      .insert(weeklyAwards)
      .values({
        seasonId,
        weekNo,
        category: award.category,
        membershipId: award.membershipId,
        teamId: null,
        value: award.value,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [
          weeklyAwards.seasonId,
          weeklyAwards.weekNo,
          weeklyAwards.category,
        ],
        // Matches the partial unique index covering season-wide categories,
        // whose teamId is null.
        targetWhere: sql`"teamId" is null`,
        set: { membershipId: award.membershipId, value: award.value },
      });
  }

  /* --- 5. Notifications ------------------------------------------------ */

  const userByMembership = new Map(
    standings.members.map((m) => [m.membershipId, m.userId]),
  );
  const metricNames = Object.fromEntries(
    standings.metrics.map((m) => [m.key, m.name]),
  );

  let notificationCount = 0;

  const raise = async (row: typeof notifications.$inferInsert) => {
    const result = await db
      .insert(notifications)
      .values(row)
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (result.length > 0) notificationCount++;
  };

  for (const award of newAwards) {
    const userId = userByMembership.get(award.membershipId);
    if (!userId) continue;
    await raise({
      userId,
      seasonId,
      kind: "badge_earned",
      title: `${award.badgeIcon} ${award.badgeName} unlocked`,
      body: "A new badge has been added to your cabinet.",
      link: "/hall-of-fame",
      dedupeKey: `badge:${seasonId}:${award.badgeId}`,
      createdAt: now,
    });
  }

  for (const award of selected) {
    const userId = userByMembership.get(award.membershipId);
    if (!userId) continue;
    await raise({
      userId,
      seasonId,
      kind: "mvp_awarded",
      title: `🏆 ${describeAwardCategory(award.category, metricNames)} — week ${weekNo}`,
      body: "You topped the season this week.",
      link: "/hall-of-fame",
      dedupeKey: `award:${seasonId}:${weekNo}:${award.category}`,
      createdAt: now,
    });
  }

  // Nudge anyone missing a required metric.
  const requiredKeys = standings.metrics
    .filter((m) => m.key !== "attendance")
    .map((m) => m.key);
  for (const member of standings.members) {
    const recorded = recordedBy.get(member.membershipId) ?? new Set<string>();
    const missing = requiredKeys.filter((key) => !recorded.has(key));
    if (missing.length === 0) continue;
    const userId = userByMembership.get(member.membershipId);
    if (!userId) continue;
    await raise({
      userId,
      seasonId,
      kind: "missing_work",
      title: `${missing.length} metric${missing.length === 1 ? "" : "s"} not yet recorded`,
      body: `Still outstanding: ${missing.map((k) => metricNames[k] ?? k).join(", ")}.`,
      link: "/me",
      dedupeKey: `missing:${seasonId}:${weekNo}:${member.membershipId}`,
      createdAt: now,
    });
  }

  return {
    weekNo,
    members: standings.members.length,
    snapshots: standings.members.length,
    badgesAwarded: newAwards.length,
    awards: selected.length,
    notifications: notificationCount,
  };
}
