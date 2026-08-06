import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  badges,
  memberBadges,
  memberships,
  notifications,
  scoreSnapshots,
  seasons,
  teams,
  users,
  weeklyAwards,
} from "@/db/schema";
import { describeAwardCategory } from "@/domain/awards";

/* ------------------------------------------------------------ notifications */

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotifications(
  db: Database,
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnread(
  db: Database,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return Number(row?.n ?? 0);
}

/* -------------------------------------------------------------- MVP awards */

export type AwardRow = {
  id: string;
  weekNo: number;
  category: string;
  label: string;
  membershipId: string;
  name: string;
  teamName: string;
  teamColor: string;
  value: number | null;
  note: string | null;
};

export async function listWeeklyAwards(
  db: Database,
  seasonId: string,
  metricNames: Record<string, string> = {},
): Promise<AwardRow[]> {
  const rows = await db
    .select({
      id: weeklyAwards.id,
      weekNo: weeklyAwards.weekNo,
      category: weeklyAwards.category,
      membershipId: weeklyAwards.membershipId,
      value: weeklyAwards.value,
      note: weeklyAwards.note,
      name: users.name,
      email: users.email,
      teamName: teams.name,
      teamColor: teams.color,
    })
    .from(weeklyAwards)
    .innerJoin(memberships, eq(memberships.id, weeklyAwards.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(eq(weeklyAwards.seasonId, seasonId))
    .orderBy(desc(weeklyAwards.weekNo), asc(weeklyAwards.category));

  return rows.map((row) => ({
    id: row.id,
    weekNo: row.weekNo,
    category: row.category,
    label: describeAwardCategory(row.category, metricNames),
    membershipId: row.membershipId,
    name: row.name ?? row.email ?? "Unknown",
    teamName: row.teamName,
    teamColor: row.teamColor,
    value: row.value,
    note: row.note,
  }));
}

/* ------------------------------------------------------------ hall of fame */

export type Legend = {
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  membershipId: string;
  name: string;
  teamName: string;
  teamColor: string;
  score: number;
  rank: number;
  /** MVP weeks won in that season. */
  mvpWeeks: number;
};

/**
 * Cross-season champions: whoever finished top of each season's final
 * snapshot week. This is what makes the Hall of Fame a history rather than a
 * restatement of the current standings.
 */
export async function getLegends(db: Database): Promise<Legend[]> {
  const [seasonRows, snapshots, awards] = await Promise.all([
    db.select().from(seasons).orderBy(desc(seasons.startsOn)),
    db
      .select({
        seasonId: scoreSnapshots.seasonId,
        membershipId: scoreSnapshots.membershipId,
        weekNo: scoreSnapshots.weekNo,
        rank: scoreSnapshots.rank,
        score: scoreSnapshots.score,
        name: users.name,
        email: users.email,
        teamName: teams.name,
        teamColor: teams.color,
      })
      .from(scoreSnapshots)
      .innerJoin(memberships, eq(memberships.id, scoreSnapshots.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(teams, eq(teams.id, memberships.teamId)),
    db
      .select({
        seasonId: weeklyAwards.seasonId,
        membershipId: weeklyAwards.membershipId,
      })
      .from(weeklyAwards)
      .where(eq(weeklyAwards.category, "overall")),
  ]);

  const legends: Legend[] = [];

  for (const season of seasonRows) {
    const inSeason = snapshots.filter((s) => s.seasonId === season.id);
    if (inSeason.length === 0) continue;

    const finalWeek = Math.max(...inSeason.map((s) => s.weekNo));
    const champion = inSeason.find(
      (s) => s.weekNo === finalWeek && s.rank === 1,
    );
    if (!champion) continue;

    legends.push({
      seasonId: season.id,
      seasonName: season.name,
      seasonStatus: season.status,
      membershipId: champion.membershipId,
      name: champion.name ?? champion.email ?? "Unknown",
      teamName: champion.teamName,
      teamColor: champion.teamColor,
      score: champion.score,
      rank: champion.rank,
      mvpWeeks: awards.filter(
        (a) =>
          a.seasonId === season.id && a.membershipId === champion.membershipId,
      ).length,
    });
  }

  return legends;
}

export type BadgeHolder = {
  badgeId: string;
  icon: string;
  name: string;
  requirementText: string;
  ruleJson: string | null;
  holders: number;
  owned: boolean;
};

/** The badge cabinet, with how many people hold each one. */
export async function getBadgeCabinet(
  db: Database,
  membershipId: string | null,
): Promise<BadgeHolder[]> {
  const [catalogue, awarded] = await Promise.all([
    db
      .select()
      .from(badges)
      .where(eq(badges.active, true))
      .orderBy(asc(badges.sortOrder)),
    db
      .select({
        badgeId: memberBadges.badgeId,
        membershipId: memberBadges.membershipId,
      })
      .from(memberBadges),
  ]);

  return catalogue.map((badge) => ({
    badgeId: badge.id,
    icon: badge.icon,
    name: badge.name,
    requirementText: badge.requirementText,
    ruleJson: badge.ruleJson,
    holders: awarded.filter((a) => a.badgeId === badge.id).length,
    owned: membershipId
      ? awarded.some(
          (a) => a.badgeId === badge.id && a.membershipId === membershipId,
        )
      : false,
  }));
}

/* ---------------------------------------------------------------- analytics */

export type WeekPoint = {
  weekNo: number;
  averageScore: number;
  /** Average normalised value per metric key. */
  metrics: Record<string, number>;
};

export type Mover = {
  membershipId: string;
  name: string;
  teamName: string;
  teamColor: string;
  delta: number;
  rank: number;
  score: number;
};

export type Analytics = {
  weeks: WeekPoint[];
  movers: Mover[];
  fallers: Mover[];
  latestWeek: number;
};

/**
 * Season trends from stored snapshots.
 *
 * Reads `breakdownJson` rather than recomputing, so the chart shows what the
 * standings actually were at the time — recomputing would silently rewrite
 * history whenever an admin changed a weight.
 */
export async function getAnalytics(
  db: Database,
  seasonId: string,
): Promise<Analytics> {
  const rows = await db
    .select({
      weekNo: scoreSnapshots.weekNo,
      membershipId: scoreSnapshots.membershipId,
      score: scoreSnapshots.score,
      rank: scoreSnapshots.rank,
      prevRank: scoreSnapshots.prevRank,
      breakdownJson: scoreSnapshots.breakdownJson,
      name: users.name,
      email: users.email,
      teamName: teams.name,
      teamColor: teams.color,
    })
    .from(scoreSnapshots)
    .innerJoin(memberships, eq(memberships.id, scoreSnapshots.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(eq(scoreSnapshots.seasonId, seasonId))
    .orderBy(asc(scoreSnapshots.weekNo));

  if (rows.length === 0) {
    return { weeks: [], movers: [], fallers: [], latestWeek: 0 };
  }

  const byWeek = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byWeek.get(row.weekNo) ?? [];
    list.push(row);
    byWeek.set(row.weekNo, list);
  }

  const weeks: WeekPoint[] = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNo, inWeek]) => {
      const metricTotals = new Map<string, { sum: number; n: number }>();
      for (const row of inWeek) {
        if (!row.breakdownJson) continue;
        try {
          const parsed = JSON.parse(row.breakdownJson) as {
            key: string;
            value: number;
          }[];
          for (const part of parsed) {
            const bucket = metricTotals.get(part.key) ?? { sum: 0, n: 0 };
            bucket.sum += part.value;
            bucket.n += 1;
            metricTotals.set(part.key, bucket);
          }
        } catch {
          // A snapshot written before breakdowns were stored, or corrupted —
          // skip it rather than losing the whole week.
        }
      }

      return {
        weekNo,
        averageScore:
          inWeek.reduce((sum, r) => sum + r.score, 0) / inWeek.length,
        metrics: Object.fromEntries(
          [...metricTotals.entries()].map(([key, b]) => [key, b.sum / b.n]),
        ),
      };
    });

  const latestWeek = Math.max(...byWeek.keys());
  const latest = byWeek.get(latestWeek) ?? [];

  const movement: Mover[] = latest
    .filter((row) => row.prevRank !== null)
    .map((row) => ({
      membershipId: row.membershipId,
      name: row.name ?? row.email ?? "Unknown",
      teamName: row.teamName,
      teamColor: row.teamColor,
      delta: (row.prevRank ?? row.rank) - row.rank,
      rank: row.rank,
      score: row.score,
    }));

  return {
    weeks,
    latestWeek,
    movers: movement
      .filter((m) => m.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5),
    fallers: movement
      .filter((m) => m.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5),
  };
}
