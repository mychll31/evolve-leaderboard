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
import { meetings, memberships, seasons } from "./season";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const metrics = sqliteTable(
  "metric",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Stable slug (`attendance`, `assignment`) used by seeds and queries. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["percentage", "integer", "decimal", "boolean", "manual_score"],
    }).notNull(),
    weight: real("weight").notNull().default(0),
    /**
     * Normalisation scale for `integer` and `decimal` metrics — 7 of a target
     * of 8 becomes 87.5. Without it, "Assignments: 7" has no scale and cannot
     * be weighed against "Attendance: 93%". Ignored for the other types.
     */
    target: real("target"),
    required: integer("required", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sortOrder").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [uniqueIndex("metric_season_key_idx").on(t.seasonId, t.key)],
);

/**
 * One generic fact table for every metric type. This is what makes the metric
 * builder genuinely dynamic rather than three hardcoded columns: attendance is
 * one row per member per meeting with `value` 1/0, an assignment metric is a
 * row with `value` = count, a manual coach score is a row with `value` 1-10.
 * Adding a new KPI next season is an admin action, not a migration.
 *
 * Lateness is deliberately NOT stored — it is derived from `recordedAt`
 * against the meeting's `startsAt + lateAfterMinutes`, so the rule can change
 * without rewriting history.
 */
export const metricEntries = sqliteTable(
  "metric_entry",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    metricId: text("metricId")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    membershipId: text("membershipId")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    /** Set for per-session metrics (attendance); null for the rest. */
    meetingId: text("meetingId").references(() => meetings.id, {
      onDelete: "cascade",
    }),
    value: real("value").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    /** Distinguishes a genuine self check-in from a coach filling gaps in. */
    source: text("source", { enum: ["self", "coach", "admin", "import"] })
      .notNull()
      .default("self"),
    recordedBy: text("recordedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedAt: integer("recordedAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    decidedBy: text("decidedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: integer("decidedAt", { mode: "timestamp_ms" }),
    note: text("note"),
  },
  (t) => [
    index("entry_season_metric_idx").on(t.seasonId, t.metricId),
    index("entry_membership_idx").on(t.membershipId),
    // One entry per member per metric per meeting: a second check-in updates
    // the existing row rather than creating a duplicate.
    uniqueIndex("entry_unique_idx").on(t.membershipId, t.metricId, t.meetingId),
    // SQLite treats NULLs as distinct in a unique index, so the index above
    // does NOT constrain season-level metrics (assignment, quiz) where
    // meetingId is null. This partial index covers exactly that case.
    uniqueIndex("entry_unique_no_meeting_idx")
      .on(t.membershipId, t.metricId)
      .where(sql`${t.meetingId} is null`),
  ],
);
