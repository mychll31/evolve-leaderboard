import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { memberships, seasons } from "./season";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Frozen weekly standings.
 *
 * This exists because the design's up/down delta arrows and six-week trend
 * need a *previous* rank — once entries change, last week's standings are
 * unrecoverable from current data.
 *
 * `weekNo = floor((date - season.startsOn) / 7) + 1` — deterministic, with no
 * ISO-week edge cases.
 */
export const scoreSnapshots = sqliteTable(
  "score_snapshot",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    membershipId: text("membershipId")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    weekNo: integer("weekNo").notNull(),
    score: real("score").notNull(),
    rank: integer("rank").notNull(),
    prevRank: integer("prevRank"),
    /** Per-metric normalised values at snapshot time, as JSON. */
    breakdownJson: text("breakdownJson"),
    computedAt: integer("computedAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("snapshot_unique_idx").on(t.seasonId, t.membershipId, t.weekNo),
    index("snapshot_week_idx").on(t.seasonId, t.weekNo),
  ],
);

export const badges = sqliteTable(
  "badge",
  {
    id: id(),
    /** Null means the badge is available in every season. */
    seasonId: text("seasonId").references(() => seasons.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull().unique(),
    icon: text("icon").notNull(),
    name: text("name").notNull(),
    requirementText: text("requirementText").notNull(),
    /** Award rule, evaluated by the Build 3 engine. Unused in Build 1. */
    ruleJson: text("ruleJson"),
    sortOrder: integer("sortOrder").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("badge_season_idx").on(t.seasonId)],
);

export const memberBadges = sqliteTable(
  "member_badge",
  {
    id: id(),
    membershipId: text("membershipId")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    badgeId: text("badgeId")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    awardedAt: integer("awardedAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("member_badge_unique_idx").on(t.membershipId, t.badgeId),
    index("member_badge_membership_idx").on(t.membershipId),
  ],
);
