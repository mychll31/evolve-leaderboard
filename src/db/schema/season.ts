import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const seasons = sqliteTable("season", {
  id: id(),
  name: text("name").notNull(),
  /** `YYYY-MM-DD`, sortable as text. */
  startsOn: text("startsOn").notNull(),
  endsOn: text("endsOn").notNull(),
  status: text("status", {
    enum: ["draft", "active", "locked", "archived"],
  })
    .notNull()
    .default("draft"),
  formula: text("formula", { enum: ["weighted", "points", "average"] })
    .notNull()
    .default("weighted"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const teams = sqliteTable(
  "team",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    abbr: text("abbr").notNull(),
    /** Hex colour; the ten-team palette is data, not code. */
    color: text("color").notNull(),
    sortOrder: integer("sortOrder").notNull().default(0),
  },
  (t) => [index("team_season_idx").on(t.seasonId)],
);

/**
 * A person's place on a team for one season. This is the unit every score,
 * entry and badge hangs off, which is what makes season isolation automatic.
 */
export const memberships = sqliteTable(
  "membership",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    teamId: text("teamId")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["coach", "member"] })
      .notNull()
      .default("member"),
    /** Basketball flavour: PG / SG / SF / PF / C. Optional. */
    position: text("position"),
    joinedAt: integer("joinedAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    // One team place per person per season, so "my team" is never ambiguous.
    uniqueIndex("membership_season_user_idx").on(t.seasonId, t.userId),
    index("membership_team_idx").on(t.teamId),
  ],
);

/**
 * The admin-defined session calendar. Everything time-based derives from this:
 * streaks count consecutive held meetings, the heatmap plots them, and the
 * attendance denominator is the count of held meetings.
 */
export const meetings = sqliteTable(
  "meeting",
  {
    id: id(),
    seasonId: text("seasonId")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    meetsOn: text("meetsOn").notNull(),
    /** Scheduled start, used with `lateAfterMinutes` to derive lateness. */
    startsAt: integer("startsAt", { mode: "timestamp_ms" }).notNull(),
    lateAfterMinutes: real("lateAfterMinutes").notNull().default(0),
    label: text("label"),
    status: text("status", { enum: ["scheduled", "held", "cancelled"] })
      .notNull()
      .default("scheduled"),
  },
  (t) => [
    index("meeting_season_date_idx").on(t.seasonId, t.meetsOn),
    uniqueIndex("meeting_season_meets_on_idx").on(t.seasonId, t.meetsOn),
  ],
);
