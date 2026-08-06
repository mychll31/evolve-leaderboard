import { scoreMember } from "@/domain/scoring";
import { rankMembers } from "@/domain/ranking";
import type { Entry, Metric } from "@/domain/types";
import type { Database } from "./client";
import {
  badges,
  meetings,
  memberBadges,
  memberships,
  metricEntries,
  metrics,
  scoreSnapshots,
  seasons,
  teams,
  users,
  weeklyAwards,
} from "./schema";

/* -------------------------------------------------------------------------
 * Fixture — the prototype's cast, reproduced exactly.
 * ---------------------------------------------------------------------- */

const TEAMS = [
  { name: "Founders", abbr: "FDR", color: "#12B5CB", coach: "John Doe" },
  { name: "Builders", abbr: "BLD", color: "#F97316", coach: "Sarah Kim" },
  { name: "Trailblazers", abbr: "TBZ", color: "#E11D48", coach: "Marcus Lee" },
  { name: "Mavericks", abbr: "MAV", color: "#7C3AED", coach: "Ana Reyes" },
  { name: "Titans", abbr: "TTN", color: "#475569", coach: "David Cruz" },
  { name: "Pioneers", abbr: "PNR", color: "#16A34A", coach: "Grace Obi" },
  { name: "Visionaries", abbr: "VSN", color: "#D97706", coach: "Leo Tan" },
  { name: "Catalysts", abbr: "CTL", color: "#0EA5E9", coach: "Priya Nair" },
  { name: "Nomads", abbr: "NMD", color: "#DB2777", coach: "Tomás Vela" },
  { name: "Guardians", abbr: "GRD", color: "#0D9488", coach: "Hannah Yoo" },
] as const;

/**
 * `att`, `asn` and `quiz` are the *target percentages* from the prototype.
 * The seeder works backwards from them to generate real entries that produce
 * roughly those figures, so the screens match the design without any of the
 * numbers being hardcoded into the app.
 */
const PLAYERS = [
  { name: "Michael", team: 0, pos: "PG", att: 99, asn: 96, quiz: 94, streak: 12 },
  { name: "John", team: 4, pos: "SG", att: 95, asn: 94, quiz: 96, streak: 9 },
  { name: "Amara", team: 1, pos: "SF", att: 97, asn: 91, quiz: 89, streak: 11 },
  { name: "Diego", team: 3, pos: "PF", att: 92, asn: 95, quiz: 90, streak: 7 },
  { name: "Grace", team: 2, pos: "C", att: 94, asn: 88, quiz: 93, streak: 6 },
  { name: "Noah", team: 0, pos: "SG", att: 90, asn: 92, quiz: 87, streak: 8 },
  { name: "Leila", team: 5, pos: "PG", att: 93, asn: 86, quiz: 91, streak: 5 },
  { name: "Samuel", team: 6, pos: "SF", att: 88, asn: 90, quiz: 85, streak: 4 },
  { name: "Yara", team: 7, pos: "C", att: 91, asn: 84, quiz: 88, streak: 6 },
  { name: "Kwame", team: 1, pos: "PF", att: 86, asn: 89, quiz: 83, streak: 3 },
  { name: "Elena", team: 8, pos: "SG", att: 89, asn: 82, quiz: 86, streak: 5 },
  { name: "Tobias", team: 9, pos: "PG", att: 84, asn: 87, quiz: 80, streak: 2 },
  { name: "Priya", team: 2, pos: "SF", att: 87, asn: 80, quiz: 84, streak: 4 },
  { name: "Marcus", team: 4, pos: "C", att: 82, asn: 85, quiz: 78, streak: 3 },
] as const;

/**
 * Rules are what make these awardable by the weekly rollup. Without a rule a
 * badge is display-only, so every seeded badge carries one.
 */
const BADGES = [
  {
    key: "on-fire",
    icon: "🔥",
    name: "On Fire",
    requirementText: "5 session streak",
    rule: { type: "streak", threshold: 5 },
  },
  {
    key: "triple-double",
    icon: "🏀",
    name: "Triple Double",
    requirementText: "100% in every metric",
    rule: { type: "all_metrics_at_least", value: 100 },
  },
  {
    key: "iron-man",
    icon: "💎",
    name: "Iron Man",
    requirementText: "20 session perfect streak",
    rule: { type: "streak", threshold: 20 },
  },
  {
    key: "rookie",
    icon: "🚀",
    name: "Rookie",
    requirementText: "First assignment recorded",
    rule: { type: "has_any_entry", metricKey: "assignment" },
  },
  {
    key: "mvp",
    icon: "👑",
    name: "MVP",
    requirementText: "Finish the week at rank 1",
    rule: { type: "rank_at_most", value: 1 },
  },
  {
    key: "defensive",
    icon: "🛡",
    name: "Defensive Player",
    requirementText: "Biggest rank gain of the week",
    rule: { type: "most_improved" },
  },
] as const;

const METRICS = [
  { key: "attendance", name: "Attendance", type: "percentage", weight: 40, target: null, required: true },
  { key: "assignment", name: "Assignment", type: "integer", weight: 40, target: 8, required: true },
  { key: "quiz", name: "Quiz", type: "integer", weight: 20, target: 10, required: false },
] as const;

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/** Deterministic PRNG — never `Math.random()`, so seeds are reproducible. */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Midnight UTC, so date maths never drifts with the runner's timezone. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function slugEmail(name: string): string {
  return `${name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, ".")}@core.example`;
}

export type SeedOptions = {
  /** Anchor date. Defaults to now; pass a fixed date in tests. */
  today?: Date;
  /** Address promoted to super admin, and mapped onto the member "Michael". */
  adminEmail?: string;
};

export type SeedResult = {
  seasonId: string;
  previousSeasonId: string;
  teamIds: string[];
  membershipIds: string[];
  heldMeetings: number;
};

/* -------------------------------------------------------------------------
 * Seed
 * ---------------------------------------------------------------------- */

/**
 * Populates an empty database with a mid-season fixture.
 *
 * The season is anchored *relative to `today`* — five weeks behind, four
 * ahead — rather than to the design's literal "Aug 1 — Sep 30". The design
 * simultaneously claims week 6 and 34 days left, which no fixed pair of dates
 * satisfies; anchoring relatively means the demo always lands mid-season with
 * real history behind it, whenever it is run.
 */
export async function seed(
  db: Database,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const today = utcDay(options.today ?? new Date());
  const adminEmail = options.adminEmail ?? process.env.SEED_ADMIN_EMAIL ?? "admin@core.example";
  const rand = mulberry32(20260801);

  const startsOn = addDays(today, -35);
  const endsOn = addDays(today, 28);

  // --- Season -----------------------------------------------------------
  const [season] = await db
    .insert(seasons)
    .values({
      name: "Leaderboard Season 1",
      startsOn: toIso(startsOn),
      endsOn: toIso(endsOn),
      status: "active",
      formula: "weighted",
    })
    .returning({ id: seasons.id });

  // --- Teams ------------------------------------------------------------
  const teamRows = await db
    .insert(teams)
    .values(
      TEAMS.map((t, i) => ({
        seasonId: season.id,
        name: t.name,
        abbr: t.abbr,
        color: t.color,
        sortOrder: i,
      })),
    )
    .returning({ id: teams.id });

  // --- Metrics ----------------------------------------------------------
  const metricRows = await db
    .insert(metrics)
    .values(
      METRICS.map((m, i) => ({
        seasonId: season.id,
        key: m.key,
        name: m.name,
        type: m.type,
        weight: m.weight,
        target: m.target,
        required: m.required,
        sortOrder: i,
      })),
    )
    .returning({ id: metrics.id, key: metrics.key });

  const metricId = (key: string) => {
    const row = metricRows.find((m) => m.key === key);
    if (!row) throw new Error(`seed: metric ${key} missing`);
    return row.id;
  };

  // --- Meetings: Mon / Wed / Fri across the season ----------------------
  const meetingValues: {
    seasonId: string;
    meetsOn: string;
    startsAt: Date;
    lateAfterMinutes: number;
    status: "held" | "scheduled";
  }[] = [];

  for (let offset = 0; offset <= 63; offset++) {
    const date = addDays(startsOn, offset);
    const dow = date.getUTCDay();
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    if (date > endsOn) break;
    meetingValues.push({
      seasonId: season.id,
      meetsOn: toIso(date),
      startsAt: new Date(date.getTime() + 9 * 3_600_000), // 09:00 UTC
      lateAfterMinutes: 5,
      status: date < today ? "held" : "scheduled",
    });
  }

  const meetingRows = await db
    .insert(meetings)
    .values(meetingValues)
    .returning({ id: meetings.id, meetsOn: meetings.meetsOn, status: meetings.status });

  const heldMeetings = meetingRows
    .filter((m) => m.status === "held")
    .sort((a, b) => a.meetsOn.localeCompare(b.meetsOn));
  const heldCount = heldMeetings.length;

  // --- Users and memberships -------------------------------------------
  const coachRows = await db
    .insert(users)
    .values(
      TEAMS.map((t) => ({ name: t.coach, email: slugEmail(t.coach) })),
    )
    .returning({ id: users.id });

  // The super admin is also the member "Michael", so signing in as the admin
  // lands on a populated player card as well as the admin screens.
  const playerRows = await db
    .insert(users)
    .values(
      PLAYERS.map((p, i) => ({
        name: p.name,
        email: i === 0 ? adminEmail : slugEmail(p.name),
        role: i === 0 ? ("super_admin" as const) : ("user" as const),
      })),
    )
    .returning({ id: users.id });

  await db.insert(memberships).values(
    TEAMS.map((_, i) => ({
      seasonId: season.id,
      teamId: teamRows[i].id,
      userId: coachRows[i].id,
      role: "coach" as const,
    })),
  );

  const memberRows = await db
    .insert(memberships)
    .values(
      PLAYERS.map((p, i) => ({
        seasonId: season.id,
        teamId: teamRows[p.team].id,
        userId: playerRows[i].id,
        role: "member" as const,
        position: p.pos,
      })),
    )
    .returning({ id: memberships.id });

  // --- Metric entries ---------------------------------------------------
  const attendanceId = metricId("attendance");
  const entryValues: (typeof metricEntries.$inferInsert)[] = [];

  /** Per-member attendance pattern, kept consistent with their streak. */
  const attendanceByMember: boolean[][] = [];

  PLAYERS.forEach((player, i) => {
    const presentCount = Math.min(
      heldCount,
      Math.max(0, Math.round((player.att / 100) * heldCount)),
    );
    const streak = Math.min(player.streak, presentCount, heldCount);

    // Present at the last `streak` meetings, absent at the one before, and the
    // remaining absences scattered across the earlier part of the season. This
    // is what makes the seeded streak agree with the seeded attendance rather
    // than the two being independently invented.
    const present = new Array<boolean>(heldCount).fill(true);
    let absencesLeft = heldCount - presentCount;
    const breakIndex = heldCount - streak - 1;
    if (absencesLeft > 0 && breakIndex >= 0) {
      present[breakIndex] = false;
      absencesLeft--;
    }
    for (let k = breakIndex - 1; k >= 0 && absencesLeft > 0; k--) {
      if (rand() < 0.45) {
        present[k] = false;
        absencesLeft--;
      }
    }
    for (let k = 0; k < breakIndex && absencesLeft > 0; k++) {
      if (present[k]) {
        present[k] = false;
        absencesLeft--;
      }
    }
    attendanceByMember[i] = present;

    heldMeetings.forEach((meeting, k) => {
      const isLastHeld = k === heldCount - 1;

      // Leave the most recent session unrecorded for one Founder so the Coach
      // Desk always opens with real work. Check-ins count immediately now, so
      // "unaccounted for" is the only outstanding state a coach can act on.
      // Anchored to the latest session rather than to "today", so it holds
      // whatever weekday the seed runs on.
      if (isLastHeld && player.name === "Noah") return;

      const isLate = present[k] && rand() < 0.12;
      const startsAt = new Date(`${meeting.meetsOn}T09:00:00.000Z`).getTime();
      const selfRecorded = rand() < 0.8;
      const teamCoachId = coachRows[player.team].id;
      entryValues.push({
        seasonId: season.id,
        metricId: attendanceId,
        membershipId: memberRows[i].id,
        meetingId: meeting.id,
        value: present[k] ? 1 : 0,
        status: "approved",
        source: selfRecorded ? "self" : "coach",
        recordedBy: selfRecorded ? playerRows[i].id : teamCoachId,
        // Late members checked in after the 5-minute grace window; lateness is
        // read back off this timestamp rather than stored as a flag.
        recordedAt: new Date(startsAt + (isLate ? 9 : -3) * 60_000),
        // The coach who approved it — without this the audit trail shows a
        // decision with nobody attached to it.
        decidedBy: teamCoachId,
        decidedAt: new Date(startsAt + 30 * 60_000),
      });
    });

    entryValues.push({
      seasonId: season.id,
      metricId: metricId("assignment"),
      membershipId: memberRows[i].id,
      meetingId: null,
      value: Math.round((player.asn / 100) * 8),
      status: "approved",
      source: "coach",
      recordedBy: coachRows[player.team].id,
      recordedAt: new Date(today.getTime() - DAY_MS),
      decidedBy: coachRows[player.team].id,
      decidedAt: new Date(today.getTime() - DAY_MS),
    });

    entryValues.push({
      seasonId: season.id,
      metricId: metricId("quiz"),
      membershipId: memberRows[i].id,
      meetingId: null,
      value: Math.round((player.quiz / 100) * 10),
      status: "approved",
      source: "coach",
      recordedBy: coachRows[player.team].id,
      recordedAt: new Date(today.getTime() - DAY_MS),
      decidedBy: coachRows[player.team].id,
      decidedAt: new Date(today.getTime() - DAY_MS),
    });
  });

  for (let i = 0; i < entryValues.length; i += 200) {
    await db.insert(metricEntries).values(entryValues.slice(i, i + 200));
  }

  // --- Badges -----------------------------------------------------------
  const badgeRows = await db
    .insert(badges)
    .values(
      BADGES.map((b, i) => ({
        key: b.key,
        icon: b.icon,
        name: b.name,
        requirementText: b.requirementText,
        ruleJson: JSON.stringify(b.rule),
        sortOrder: i,
      })),
    )
    .returning({ id: badges.id, key: badges.key });

  const badgeId = (key: string) => badgeRows.find((b) => b.key === key)!.id;
  const awards: { membershipId: string; badgeId: string; seasonId: string }[] = [];
  PLAYERS.forEach((player, i) => {
    const owned: string[] = ["rookie"];
    if (player.streak >= 5) owned.push("on-fire");
    if (player.att >= 95 && player.asn >= 90) owned.push("triple-double");
    if (i === 0) owned.push("mvp");
    owned.forEach((key) =>
      awards.push({
        membershipId: memberRows[i].id,
        badgeId: badgeId(key),
        seasonId: season.id,
      }),
    );
  });
  await db.insert(memberBadges).values(awards);

  // --- Weekly snapshots -------------------------------------------------
  // Synthetic history: assignment and quiz totals are pro-rated across the
  // weeks so earlier standings differ from today's and the delta arrows have
  // something real to compare against.
  const currentWeek = Math.max(1, Math.ceil(heldCount / 3));
  const metricDefs: Metric[] = metricRows.map((row) => {
    const def = METRICS.find((m) => m.key === row.key)!;
    return {
      id: row.id,
      key: def.key,
      name: def.name,
      type: def.type,
      weight: def.weight,
      target: def.target,
    };
  });

  const snapshotValues: (typeof scoreSnapshots.$inferInsert)[] = [];
  let previousRanks = new Map<string, number>();

  for (let week = 1; week <= currentWeek; week++) {
    const meetingsThisFar = Math.min(heldCount, week * 3);
    const rows = PLAYERS.map((player, i) => {
      const entries: Entry[] = [];
      for (let k = 0; k < meetingsThisFar; k++) {
        entries.push({
          metricId: attendanceId,
          meetingId: heldMeetings[k].id,
          value: attendanceByMember[i][k] ? 1 : 0,
          status: "approved",
        });
      }
      const share = week / currentWeek;
      entries.push({
        metricId: metricId("assignment"),
        meetingId: null,
        value: Math.round((player.asn / 100) * 8 * share),
        status: "approved",
      });
      entries.push({
        metricId: metricId("quiz"),
        meetingId: null,
        value: Math.round((player.quiz / 100) * 10 * share),
        status: "approved",
      });

      const score = scoreMember(metricDefs, entries, meetingsThisFar, "weighted");
      const attendance = meetingsThisFar
        ? (attendanceByMember[i].slice(0, meetingsThisFar).filter(Boolean).length /
            meetingsThisFar) *
          100
        : 0;
      return {
        membershipId: memberRows[i].id,
        score,
        attendance,
        name: player.name,
      };
    });

    const ranked = rankMembers(rows);
    for (const row of ranked) {
      snapshotValues.push({
        seasonId: season.id,
        membershipId: row.membershipId,
        weekNo: week,
        score: row.score,
        rank: row.rank,
        prevRank: previousRanks.get(row.membershipId) ?? null,
      });
    }
    previousRanks = new Map(ranked.map((r) => [r.membershipId, r.rank]));
  }

  await db.insert(scoreSnapshots).values(snapshotValues);

  // --- Weekly MVP awards for the completed weeks ------------------------
  const awardValues: (typeof weeklyAwards.$inferInsert)[] = [];
  for (let week = 1; week <= currentWeek; week++) {
    const inWeek = snapshotValues.filter((s) => s.weekNo === week);
    const winner = inWeek.find((s) => s.rank === 1);
    if (winner) {
      awardValues.push({
        seasonId: season.id,
        weekNo: week,
        category: "overall",
        membershipId: winner.membershipId,
        value: winner.score,
      });
    }
    const climbers = inWeek
      .filter((s) => s.prevRank != null && s.prevRank > s.rank)
      .sort((a, b) => (b.prevRank! - b.rank) - (a.prevRank! - a.rank));
    if (climbers[0]) {
      awardValues.push({
        seasonId: season.id,
        weekNo: week,
        category: "most_improved",
        membershipId: climbers[0].membershipId,
        value: climbers[0].prevRank! - climbers[0].rank,
      });
    }
  }
  if (awardValues.length > 0) {
    await db.insert(weeklyAwards).values(awardValues);
  }

  const previousSeasonId = await seedPreviousSeason(db, {
    startsOn: toIso(addDays(startsOn, -70)),
    endsOn: toIso(addDays(startsOn, -7)),
    badgeIds: badgeRows,
    rand,
  });

  return {
    seasonId: season.id,
    previousSeasonId,
    teamIds: teamRows.map((t) => t.id),
    membershipIds: memberRows.map((m) => m.id),
    heldMeetings: heldCount,
  };
}

/**
 * A completed, archived season so the Hall of Fame has genuine cross-season
 * history rather than restating the current standings.
 *
 * Compact on purpose: four teams, eight members, final snapshots and MVP
 * awards. No meetings or entries — the season is closed, and its results are
 * what matter.
 */
async function seedPreviousSeason(
  db: Database,
  options: {
    startsOn: string;
    endsOn: string;
    badgeIds: { id: string; key: string }[];
    rand: () => number;
  },
): Promise<string> {
  const { startsOn, endsOn, badgeIds, rand } = options;

  const [season] = await db
    .insert(seasons)
    .values({
      name: "Leaderboard Preseason",
      startsOn,
      endsOn,
      status: "archived",
      formula: "weighted",
    })
    .returning({ id: seasons.id });

  const priorTeams = TEAMS.slice(0, 4);
  const teamRows = await db
    .insert(teams)
    .values(
      priorTeams.map((t, i) => ({
        seasonId: season.id,
        name: t.name,
        abbr: t.abbr,
        color: t.color,
        sortOrder: i,
      })),
    )
    .returning({ id: teams.id });

  const alumni = [
    { name: "Amara", score: 96.4 },
    { name: "John", score: 95.1 },
    { name: "Grace", score: 93.8 },
    { name: "Michael", score: 92.2 },
    { name: "Diego", score: 90.7 },
    { name: "Leila", score: 88.3 },
    { name: "Samuel", score: 86.9 },
    { name: "Yara", score: 85.4 },
  ];

  // Reuse the existing user rows where the name matches, so the same person
  // genuinely appears across both seasons.
  const existing = await db.select({ id: users.id, name: users.name }).from(users);

  const membershipValues: (typeof memberships.$inferInsert)[] = [];
  for (const [i, person] of alumni.entries()) {
    const match = existing.find((u) => u.name === person.name);
    const userId =
      match?.id ??
      (
        await db
          .insert(users)
          .values({ name: person.name, email: slugEmail(`${person.name}.alum`) })
          .returning({ id: users.id })
      )[0].id;

    membershipValues.push({
      seasonId: season.id,
      teamId: teamRows[i % teamRows.length].id,
      userId,
      role: "member",
      position: PLAYERS.find((p) => p.name === person.name)?.pos ?? null,
    });
  }

  const memberRows = await db
    .insert(memberships)
    .values(membershipValues)
    .returning({ id: memberships.id });

  // Final standings only — three weeks of history, converging on the result.
  const snapshotValues: (typeof scoreSnapshots.$inferInsert)[] = [];
  const awardValues: (typeof weeklyAwards.$inferInsert)[] = [];

  for (let week = 1; week <= 3; week++) {
    const shuffled = alumni
      .map((person, i) => ({
        membershipId: memberRows[i].id,
        score: person.score - (3 - week) * (1 + rand() * 2),
      }))
      .sort((a, b) => b.score - a.score);

    shuffled.forEach((row, index) => {
      const previous = snapshotValues.find(
        (s) => s.membershipId === row.membershipId && s.weekNo === week - 1,
      );
      snapshotValues.push({
        seasonId: season.id,
        membershipId: row.membershipId,
        weekNo: week,
        score: Math.round(row.score * 10) / 10,
        rank: index + 1,
        prevRank: previous?.rank ?? null,
      });
    });

    awardValues.push({
      seasonId: season.id,
      weekNo: week,
      category: "overall",
      membershipId: shuffled[0].membershipId,
      value: Math.round(shuffled[0].score * 10) / 10,
    });
  }

  await db.insert(scoreSnapshots).values(snapshotValues);
  await db.insert(weeklyAwards).values(awardValues);

  // The season's champion keeps their crown.
  const champion = snapshotValues.find((s) => s.weekNo === 3 && s.rank === 1);
  const mvpBadge = badgeIds.find((b) => b.key === "mvp");
  if (champion && mvpBadge) {
    await db.insert(memberBadges).values({
      membershipId: champion.membershipId,
      badgeId: mvpBadge.id,
      seasonId: season.id,
    });
  }

  return season.id;
}
