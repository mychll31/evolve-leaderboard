import { aliasedTable, and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  memberships,
  metricEntries,
  metrics,
  teams,
  users,
} from "@/db/schema";
import type { MemberStanding, Standings } from "./standings";

export type EntryAudit = {
  entryId: string;
  value: number;
  status: "pending" | "approved" | "rejected";
  source: "self" | "coach" | "admin" | "import";
  recordedAt: Date;
  recordedByName: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  note: string | null;
};

export type SeasonMetricRow = {
  metricId: string;
  key: string;
  name: string;
  entry: EntryAudit | null;
};

/**
 * One metric as the member themselves sees it on /me: what is recorded, who
 * recorded it, and whether they may still change it.
 */
export type SelfLogRow = {
  metricId: string;
  key: string;
  name: string;
  /** The season-level value scoring reads. Null when nothing is recorded. */
  value: number | null;
  /** Done: the member logged it, or a Leader recorded anything above zero. */
  logged: boolean;
  source: EntryAudit["source"] | null;
  recordedAt: Date | null;
  recordedByName: string | null;
  /** A Leader or admin owns this value, so the member may not overwrite it. */
  locked: boolean;
};

export type MemberDetail = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  initials: string;
  image: string | null;
  position: string | null;
  seasonRole: "member" | "coach";
  active: boolean;
  teamId: string;
  teamName: string;
  teamColor: string;
  /** Null for coaches, who are not scored. */
  standing: MemberStanding | null;
  seasonMetrics: SeasonMetricRow[];
};

/**
 * The member's own logging surface: every active metric this season, with the
 * season-level value that scoring actually reads.
 *
 * Deliberately narrower than `getMemberDetail` — it looks only at the
 * `meetingId is null` row, because that is the row a member's own save writes
 * to. Falling back to a legacy per-session row here would show a value the
 * member cannot edit and mislabel the metric as locked.
 */
export async function getSelfLog(
  db: Database,
  seasonId: string,
  membershipId: string,
): Promise<SelfLogRow[]> {
  const recorder = aliasedTable(users, "recorder");

  const [metricRows, entryRows] = await Promise.all([
    db
      .select()
      .from(metrics)
      .where(and(eq(metrics.seasonId, seasonId), eq(metrics.active, true)))
      .orderBy(asc(metrics.sortOrder)),
    db
      .select({
        metricId: metricEntries.metricId,
        value: metricEntries.value,
        status: metricEntries.status,
        source: metricEntries.source,
        recordedAt: metricEntries.recordedAt,
        recordedByName: recorder.name,
      })
      .from(metricEntries)
      .leftJoin(recorder, eq(recorder.id, metricEntries.recordedBy))
      .where(
        and(
          eq(metricEntries.membershipId, membershipId),
          isNull(metricEntries.meetingId),
        ),
      ),
  ]);

  return metricRows.map((metric) => {
    const entry = entryRows.find((e) => e.metricId === metric.id) ?? null;
    return {
      metricId: metric.id,
      key: metric.key,
      name: metric.name,
      value: entry?.value ?? null,
      logged: (entry?.value ?? 0) > 0,
      source: entry?.source ?? null,
      recordedAt: entry?.recordedAt ?? null,
      recordedByName: entry?.recordedByName ?? null,
      locked: Boolean(entry && entry.source !== "self"),
    };
  });
}

/**
 * Everything the per-member detail page shows: current value per active metric
 * and the audit trail behind each one.
 */
export async function getMemberDetail(
  db: Database,
  standings: Standings,
  membershipId: string,
): Promise<MemberDetail | null> {
  const recorder = aliasedTable(users, "recorder");
  const decider = aliasedTable(users, "decider");

  const [membership] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      position: memberships.position,
      active: memberships.active,
      seasonId: memberships.seasonId,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!membership || membership.seasonId !== standings.season.id) return null;

  const [metricRows, entryRows] = await Promise.all([
    db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.seasonId, membership.seasonId),
          eq(metrics.active, true),
        ),
      )
      .orderBy(asc(metrics.sortOrder)),
    db
      .select({
        id: metricEntries.id,
        metricId: metricEntries.metricId,
        meetingId: metricEntries.meetingId,
        value: metricEntries.value,
        status: metricEntries.status,
        source: metricEntries.source,
        recordedAt: metricEntries.recordedAt,
        decidedAt: metricEntries.decidedAt,
        note: metricEntries.note,
        recordedByName: recorder.name,
        decidedByName: decider.name,
      })
      .from(metricEntries)
      .leftJoin(recorder, eq(recorder.id, metricEntries.recordedBy))
      .leftJoin(decider, eq(decider.id, metricEntries.decidedBy))
      .where(eq(metricEntries.membershipId, membershipId)),
  ]);

  const toAudit = (row: (typeof entryRows)[number]): EntryAudit => ({
    entryId: row.id,
    value: row.value,
    status: row.status,
    source: row.source,
    recordedAt: row.recordedAt,
    recordedByName: row.recordedByName,
    decidedAt: row.decidedAt,
    decidedByName: row.decidedByName,
    note: row.note,
  });

  const seasonMetrics: SeasonMetricRow[] = metricRows.map((metric) => {
    const metricEntriesForMember = entryRows.filter((e) => e.metricId === metric.id);
    const seasonLevel =
      metricEntriesForMember.find((e) => e.meetingId === null) ??
      metricEntriesForMember.at(-1);
    return {
      metricId: metric.id,
      key: metric.key,
      name: metric.name,
      entry: seasonLevel ? toAudit(seasonLevel) : null,
    };
  });

  const name = membership.name ?? membership.email ?? "Unknown";

  return {
    membershipId: membership.id,
    userId: membership.userId,
    name,
    email: membership.email ?? "",
    initials: name.slice(0, 2).toUpperCase(),
    image: membership.image,
    position: membership.position,
    seasonRole: membership.role,
    active: membership.active,
    teamId: membership.teamId,
    teamName: membership.teamName,
    teamColor: membership.teamColor,
    standing:
      standings.members.find((m) => m.membershipId === membershipId) ?? null,
    seasonMetrics,
  };
}
