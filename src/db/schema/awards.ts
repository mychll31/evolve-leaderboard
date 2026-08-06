import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { memberships, seasons, teams } from "./season";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Weekly MVP awards.
 *
 * `category` is either a season-wide slot (`overall`, `most_improved`,
 * `metric:<key>`) or `coach_choice`, which is one nomination *per team*. That
 * is why `teamId` is part of the unique key: season-wide rows carry null,
 * coach's-choice rows carry the team.
 */
export const weeklyAwards = sqliteTable(
  "weekly_award",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    weekNo: integer("weekNo").notNull(),
    category: text("category").notNull(),
    membershipId: text("membershipId")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    /** Set only for coach's choice, which is scoped to one team. */
    teamId: text("teamId").references(() => teams.id, { onDelete: "cascade" }),
    /** The figure that won it, for display. */
    value: real("value"),
    note: text("note"),
    awardedBy: text("awardedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("weekly_award_unique_idx").on(
      t.seasonId,
      t.weekNo,
      t.category,
      t.teamId,
    ),
    // SQLite treats NULLs as distinct in a unique index, so the key above does
    // NOT constrain the season-wide categories, which all carry a null teamId.
    // Without this partial index every rollup re-run would insert a duplicate
    // MVP rather than settling on one.
    uniqueIndex("weekly_award_season_unique_idx")
      .on(t.seasonId, t.weekNo, t.category)
      .where(sql`${t.teamId} is null`),
    index("weekly_award_week_idx").on(t.seasonId, t.weekNo),
    index("weekly_award_membership_idx").on(t.membershipId),
  ],
);

/**
 * In-app notification centre.
 *
 * `channel` and `deliveredAt` are carried now, unused beyond `in_app`, so
 * email delivery can be layered on later without a migration.
 */
export const notifications = sqliteTable(
  "notification",
  {
    id: id(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seasonId: text("seasonId").references(() => seasons.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", {
      enum: [
        "badge_earned",
        "mvp_awarded",
        "missing_work",
        "attendance_late",
        "season_ending",
      ],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    /** Dedupe key, so a repeated rollup does not re-notify. */
    dedupeKey: text("dedupeKey"),
    readAt: integer("readAt", { mode: "timestamp_ms" }),
    channel: text("channel", { enum: ["in_app"] })
      .notNull()
      .default("in_app"),
    deliveredAt: integer("deliveredAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.readAt),
    uniqueIndex("notification_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);
