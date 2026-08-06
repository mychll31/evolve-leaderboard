import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  meetings,
  memberships,
  metricEntries,
  metrics,
  seasons,
  teams,
  users,
} from "@/db/schema";
import { setEntryValue } from "@/db/mutations/entries";
import {
  ConflictError,
  SeasonLockedError,
} from "@/db/mutations/guards";
import {
  createMeeting,
  deleteMeeting,
  generateMeetings,
  markHeldThrough,
  updateMeeting,
} from "@/db/mutations/meetings";
import {
  createMetric,
  setMetricActive,
  updateMetric,
} from "@/db/mutations/metrics";
import {
  createUser,
  importMembers,
  setMembershipActive,
  updateUser,
  upsertMembership,
} from "@/db/mutations/people";
import {
  cloneSeason,
  createSeason,
  setSeasonStatus,
  updateSeason,
} from "@/db/mutations/seasons";
import {
  assignCoach,
  createTeam,
  deleteTeam,
  updateTeam,
} from "@/db/mutations/teams";
import { getActiveSeason, getStandings } from "@/db/queries/standings";
import { seed } from "@/db/seed";
import { parseMemberImport } from "@/lib/csv";
import { AuthorizationError, type Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("admin mutations", () => {
  let t: TestDb;
  let seasonId: string;
  let admin: Actor;
  let coach: Actor;
  let member: Actor;

  beforeEach(async () => {
    t = await makeTestDb();
    const result = await seed(t.db, {
      today: TODAY,
      adminEmail: "admin@core.example",
    });
    seasonId = result.seasonId;

    const [adminRow] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, "admin@core.example"));
    admin = { id: adminRow.id, role: "super_admin" };

    const teamRows = await t.db.select().from(teams);
    const founders = teamRows.find((x) => x.name === "Founders")!;
    const all = await t.db.select().from(memberships);
    coach = {
      id: all.find((m) => m.teamId === founders.id && m.role === "coach")!.userId,
      role: "user",
    };
    member = {
      id: all.find(
        (m) => m.teamId === founders.id && m.role === "member" && m.userId !== adminRow.id,
      )!.userId,
      role: "user",
    };
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /* ---------------------------------------------------------------- seasons */

  describe("seasons", () => {
    it("creates a season in draft", async () => {
      const id = await createSeason(t.db, admin, {
        name: "Season 2",
        startsOn: "2026-10-01",
        endsOn: "2026-11-30",
      });
      const [row] = await t.db.select().from(seasons).where(eq(seasons.id, id));
      expect(row.status).toBe("draft");
      expect(row.formula).toBe("weighted");
    });

    it("refuses a season that ends before it starts", async () => {
      await expect(
        createSeason(t.db, admin, {
          name: "Backwards",
          startsOn: "2026-11-30",
          endsOn: "2026-10-01",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("refuses a non-admin", async () => {
      await expect(
        createSeason(t.db, coach, {
          name: "Nope",
          startsOn: "2026-10-01",
          endsOn: "2026-11-30",
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("locks the previous season when another is activated", async () => {
      const id = await createSeason(t.db, admin, {
        name: "Season 2",
        startsOn: "2026-10-01",
        endsOn: "2026-11-30",
      });
      await setSeasonStatus(t.db, admin, id, "active");

      const rows = await t.db.select().from(seasons);
      expect(rows.filter((s) => s.status === "active")).toHaveLength(1);
      expect(rows.find((s) => s.id === seasonId)!.status).toBe("locked");
    });

    it("refuses to reopen an archived season", async () => {
      await setSeasonStatus(t.db, admin, seasonId, "archived");
      await expect(
        setSeasonStatus(t.db, admin, seasonId, "active"),
      ).rejects.toThrow(ConflictError);
    });

    it("blocks edits once locked but keeps the data readable", async () => {
      await setSeasonStatus(t.db, admin, seasonId, "locked");

      await expect(
        updateSeason(t.db, admin, seasonId, {
          name: "Renamed",
          startsOn: "2026-07-02",
          endsOn: "2026-09-03",
        }),
      ).rejects.toThrow(SeasonLockedError);

      // Still fully readable — locking freezes the result, it does not hide it.
      const [row] = await t.db
        .select()
        .from(seasons)
        .where(eq(seasons.id, seasonId));
      const standings = await getStandings(t.db, row, TODAY);
      expect(standings.members).toHaveLength(14);
    });

    it("blocks attendance and score writes on a locked season", async () => {
      const all = await t.db.select().from(memberships);
      const target = all.find((m) => m.role === "member")!;
      const [metric] = await t.db
        .select()
        .from(metrics)
        .where(eq(metrics.key, "assignment"));

      await setSeasonStatus(t.db, admin, seasonId, "locked");

      await expect(
        setEntryValue(t.db, admin, {
          membershipId: target.id,
          metricId: metric.id,
          value: 5,
        }),
      ).rejects.toThrow(SeasonLockedError);
    });

    it("clones structure but never results", async () => {
      const cloneId = await cloneSeason(t.db, admin, seasonId, {
        name: "Season 2",
        startsOn: "2026-10-01",
        endsOn: "2026-11-30",
      });

      const clonedTeams = await t.db
        .select()
        .from(teams)
        .where(eq(teams.seasonId, cloneId));
      const clonedMetrics = await t.db
        .select()
        .from(metrics)
        .where(eq(metrics.seasonId, cloneId));
      const clonedMemberships = await t.db
        .select()
        .from(memberships)
        .where(eq(memberships.seasonId, cloneId));
      const clonedEntries = await t.db
        .select()
        .from(metricEntries)
        .where(eq(metricEntries.seasonId, cloneId));

      expect(clonedTeams).toHaveLength(10);
      expect(clonedMetrics).toHaveLength(3);
      // Coaches carry over; players and every result do not.
      expect(clonedMemberships.every((m) => m.role === "coach")).toBe(true);
      expect(clonedMemberships).toHaveLength(10);
      expect(clonedEntries).toHaveLength(0);
    });
  });

  /* --------------------------------------------------------------- calendar */

  describe("session calendar", () => {
    it("generates sessions on the chosen weekdays only", async () => {
      const fresh = await createSeason(t.db, admin, {
        name: "Season 2",
        startsOn: "2026-10-05", // a Monday
        endsOn: "2026-10-18",
      });
      const { created } = await generateMeetings(t.db, admin, fresh, {
        weekdays: [1, 3],
        startTime: "09:00",
        lateAfterMinutes: 5,
      });

      const rows = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.seasonId, fresh));
      expect(created).toBe(4); // two Mondays, two Wednesdays
      expect(rows).toHaveLength(4);
      expect(
        rows.every((r) => [1, 3].includes(new Date(`${r.meetsOn}T00:00:00Z`).getUTCDay())),
      ).toBe(true);
    });

    it("skips dates that already have a session instead of overwriting", async () => {
      const before = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.seasonId, seasonId));

      const { created, skipped } = await generateMeetings(
        t.db,
        admin,
        seasonId,
        { weekdays: [1, 3, 5], startTime: "09:00", lateAfterMinutes: 5 },
      );

      expect(skipped).toBe(before.length);
      expect(created).toBe(0);
    });

    it("rejects an empty weekday selection", async () => {
      await expect(
        generateMeetings(t.db, admin, seasonId, {
          weekdays: [],
          startTime: "09:00",
          lateAfterMinutes: 5,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects a malformed start time", async () => {
      await expect(
        generateMeetings(t.db, admin, seasonId, {
          weekdays: [1],
          startTime: "9am",
          lateAfterMinutes: 5,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("refuses a session outside the season's own dates", async () => {
      await expect(
        createMeeting(t.db, admin, seasonId, {
          meetsOn: "2027-01-04",
          startTime: "09:00",
          lateAfterMinutes: 5,
        }),
      ).rejects.toThrow(/inside the season/);
    });

    it("refuses two sessions on the same date", async () => {
      const [existing] = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.seasonId, seasonId));
      await expect(
        createMeeting(t.db, admin, seasonId, {
          meetsOn: existing.meetsOn,
          startTime: "10:00",
          lateAfterMinutes: 5,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("retimes a session and moves its lateness threshold with it", async () => {
      const [meeting] = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.seasonId, seasonId));
      await updateMeeting(t.db, admin, meeting.id, { startTime: "18:30" });

      const [updated] = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.id, meeting.id));
      expect(updated.startsAt.toISOString()).toBe(
        `${meeting.meetsOn}T18:30:00.000Z`,
      );
    });

    it("refuses to delete a session that already has attendance", async () => {
      const [held] = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.status, "held"));
      await expect(deleteMeeting(t.db, admin, held.id)).rejects.toThrow(
        /Cancel it instead/,
      );
    });

    it("deletes a session with no attendance", async () => {
      // A Sunday, so it does not collide with the seeded Mon/Wed/Fri calendar.
      const id = await createMeeting(t.db, admin, seasonId, {
        meetsOn: "2026-08-30",
        startTime: "09:00",
        lateAfterMinutes: 5,
      });
      await deleteMeeting(t.db, admin, id);
      const rows = await t.db
        .select()
        .from(meetings)
        .where(eq(meetings.id, id));
      expect(rows).toHaveLength(0);
    });

    it("marks past scheduled sessions as held", async () => {
      const count = await markHeldThrough(t.db, admin, seasonId, "2026-08-20");
      expect(count).toBeGreaterThan(0);
      const stillScheduled = await t.db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.seasonId, seasonId),
            eq(meetings.status, "scheduled"),
          ),
        );
      expect(stillScheduled.every((m) => m.meetsOn > "2026-08-20")).toBe(true);
    });

    it("changes the attendance denominator when a session becomes held", async () => {
      const season = await getActiveSeason(t.db);
      const before = await getStandings(t.db, season!, TODAY);
      await markHeldThrough(t.db, admin, seasonId, "2026-08-20");
      const after = await getStandings(t.db, season!, TODAY);
      expect(after.heldCount).toBeGreaterThan(before.heldCount);
    });
  });

  /* ------------------------------------------------------------------ teams */

  describe("teams", () => {
    it("creates a team", async () => {
      const id = await createTeam(t.db, admin, seasonId, {
        name: "Comets",
        abbr: "cmt",
        color: "#123456",
      });
      const [row] = await t.db.select().from(teams).where(eq(teams.id, id));
      expect(row.abbr).toBe("CMT");
    });

    it("refuses a duplicate team name in the same season", async () => {
      await expect(
        createTeam(t.db, admin, seasonId, {
          name: "founders",
          abbr: "FD2",
          color: "#123456",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("refuses a non-hex colour", async () => {
      await expect(
        createTeam(t.db, admin, seasonId, {
          name: "Comets",
          abbr: "CMT",
          color: "blue",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("refuses to delete a team that still has members", async () => {
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      await expect(deleteTeam(t.db, admin, founders.id)).rejects.toThrow(
        /still has/,
      );
    });

    it("deletes an empty team", async () => {
      const id = await createTeam(t.db, admin, seasonId, {
        name: "Comets",
        abbr: "CMT",
        color: "#123456",
      });
      await deleteTeam(t.db, admin, id);
      expect(await t.db.select().from(teams).where(eq(teams.id, id))).toHaveLength(0);
    });

    it("renames a team without disturbing its roster", async () => {
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      await updateTeam(t.db, admin, founders.id, {
        name: "Originals",
        abbr: "ORG",
        color: "#12B5CB",
      });
      const roster = await t.db
        .select()
        .from(memberships)
        .where(eq(memberships.teamId, founders.id));
      expect(roster.length).toBeGreaterThan(0);
    });

    it("deactivates the outgoing coach rather than deleting the history", async () => {
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      const newCoachId = await createUser(t.db, admin, {
        name: "New Coach",
        email: "new.coach@core.example",
      });

      await assignCoach(t.db, admin, founders.id, newCoachId);

      const coaches = await t.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.teamId, founders.id),
            eq(memberships.role, "coach"),
          ),
        );
      expect(coaches).toHaveLength(2);
      expect(coaches.filter((c) => c.active)).toHaveLength(1);
      expect(coaches.find((c) => c.active)!.userId).toBe(newCoachId);
    });

    it("moves an existing membership rather than colliding on the season constraint", async () => {
      const [titans] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Titans"));

      // `coach` already holds a Founders coach membership this season.
      await assignCoach(t.db, admin, titans.id, coach.id);

      const rows = await t.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.seasonId, seasonId),
            eq(memberships.userId, coach.id),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].teamId).toBe(titans.id);
    });
  });

  /* ----------------------------------------------------------------- people */

  describe("people", () => {
    it("creates a user", async () => {
      const id = await createUser(t.db, admin, {
        name: "Ada",
        email: " Ada@Example.CO ",
      });
      const [row] = await t.db.select().from(users).where(eq(users.id, id));
      expect(row.email).toBe("ada@example.co");
      expect(row.role).toBe("user");
    });

    it("refuses a duplicate email", async () => {
      await expect(
        createUser(t.db, admin, { name: "Clash", email: "admin@core.example" }),
      ).rejects.toThrow(ConflictError);
    });

    it("stops an admin removing their own admin access", async () => {
      await expect(
        updateUser(t.db, admin, admin.id, {
          name: "Michael",
          email: "admin@core.example",
          role: "user",
        }),
      ).rejects.toThrow(/your own admin access/);
    });

    it("transfers a member between teams without duplicating them", async () => {
      const [titans] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Titans"));
      await upsertMembership(t.db, admin, {
        seasonId,
        userId: member.id,
        teamId: titans.id,
      });

      const rows = await t.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.seasonId, seasonId),
            eq(memberships.userId, member.id),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].teamId).toBe(titans.id);
    });

    it("keeps a transferred member's entries, because they hang off the membership", async () => {
      const [membership] = await t.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.seasonId, seasonId),
            eq(memberships.userId, member.id),
          ),
        );
      const before = await t.db
        .select()
        .from(metricEntries)
        .where(eq(metricEntries.membershipId, membership.id));

      const [titans] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Titans"));
      await upsertMembership(t.db, admin, {
        seasonId,
        userId: member.id,
        teamId: titans.id,
      });

      const after = await t.db
        .select()
        .from(metricEntries)
        .where(eq(metricEntries.membershipId, membership.id));
      expect(after).toHaveLength(before.length);
    });

    it("drops a deactivated member out of the standings without deleting them", async () => {
      const [membership] = await t.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.seasonId, seasonId),
            eq(memberships.userId, member.id),
          ),
        );
      await setMembershipActive(t.db, admin, membership.id, false);

      const season = await getActiveSeason(t.db);
      const standings = await getStandings(t.db, season!, TODAY);
      expect(standings.members).toHaveLength(13);

      const stillThere = await t.db
        .select()
        .from(memberships)
        .where(eq(memberships.id, membership.id));
      expect(stillThere).toHaveLength(1);
    });
  });

  /* ------------------------------------------------------------- csv import */

  describe("member import", () => {
    it("creates new people and updates existing ones", async () => {
      const { rows, issues } = parseMemberImport(
        [
          "name,email,team,position,role",
          "Ada Lovelace,ada@core.example,Founders,PG,member",
          "Michael,admin@core.example,Founders,SG,member",
        ].join("\n"),
      );
      expect(issues).toEqual([]);

      const outcome = await importMembers(t.db, admin, seasonId, rows);
      expect(outcome.created).toBe(1);
      expect(outcome.updated).toBe(1);
      expect(outcome.errors).toEqual([]);

      const season = await getActiveSeason(t.db);
      const standings = await getStandings(t.db, season!, TODAY);
      expect(standings.members.map((m) => m.name)).toContain("Ada Lovelace");
    });

    it("refuses the whole batch when a team is unknown", async () => {
      const { rows } = parseMemberImport(
        [
          "name,email,team",
          "Ada,ada@core.example,Founders",
          "Bob,bob@core.example,Nonexistent",
        ].join("\n"),
      );

      const outcome = await importMembers(t.db, admin, seasonId, rows);
      expect(outcome.created).toBe(0);
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].line).toBe(3);

      // Nothing landed — a half-applied import is worse than a refused one.
      const [ada] = await t.db
        .select()
        .from(users)
        .where(eq(users.email, "ada@core.example"));
      expect(ada).toBeUndefined();
    });

    it("imports a coach as a coach", async () => {
      const { rows } = parseMemberImport(
        "name,email,team,role\nNew Coach,nc@core.example,Pioneers,coach",
      );
      await importMembers(t.db, admin, seasonId, rows);

      const [user] = await t.db
        .select()
        .from(users)
        .where(eq(users.email, "nc@core.example"));
      const [membership] = await t.db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, user.id));
      expect(membership.role).toBe("coach");
    });
  });

  /* ---------------------------------------------------------------- metrics */

  describe("metrics", () => {
    it("creates a metric at weight zero so it cannot dilute existing scores", async () => {
      const season = await getActiveSeason(t.db);
      const before = await getStandings(t.db, season!, TODAY);
      const beforeTop = before.members[0].score;

      await createMetric(t.db, admin, seasonId, {
        name: "Leadership",
        type: "manual_score",
      });

      const after = await getStandings(t.db, season!, TODAY);
      expect(after.members[0].score).toBeCloseTo(beforeTop, 6);
    });

    it("derives a unique key and disambiguates collisions", async () => {
      await createMetric(t.db, admin, seasonId, {
        name: "Quiz",
        type: "integer",
        target: 5,
      });
      const rows = await t.db
        .select()
        .from(metrics)
        .where(eq(metrics.seasonId, seasonId));
      const keys = rows.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toContain("quiz-2");
    });

    it("refuses an integer metric with no target to scale against", async () => {
      await expect(
        createMetric(t.db, admin, seasonId, {
          name: "Sales",
          type: "integer",
          target: 0,
        }),
      ).rejects.toThrow(/positive target/);
    });

    it("refuses to change a metric's type once values exist", async () => {
      const [assignment] = await t.db
        .select()
        .from(metrics)
        .where(eq(metrics.key, "assignment"));
      await expect(
        updateMetric(t.db, admin, assignment.id, {
          name: "Assignment",
          type: "manual_score",
        }),
      ).rejects.toThrow(/type can no longer change/);
    });

    it("allows a type change while a metric is still empty", async () => {
      const id = await createMetric(t.db, admin, seasonId, {
        name: "Leadership",
        type: "manual_score",
      });
      await updateMetric(t.db, admin, id, {
        name: "Leadership",
        type: "integer",
        target: 4,
      });
      const [row] = await t.db.select().from(metrics).where(eq(metrics.id, id));
      expect(row.type).toBe("integer");
    });

    it("keeps entries when a metric is soft-deleted, but drops it from scoring", async () => {
      const [quiz] = await t.db
        .select()
        .from(metrics)
        .where(eq(metrics.key, "quiz"));

      await setMetricActive(t.db, admin, quiz.id, false);

      const season = await getActiveSeason(t.db);
      const standings = await getStandings(t.db, season!, TODAY);
      expect(standings.metrics.map((m) => m.key)).not.toContain("quiz");
      expect(standings.members[0].breakdown.map((b) => b.key)).not.toContain("quiz");

      const entries = await t.db
        .select()
        .from(metricEntries)
        .where(eq(metricEntries.metricId, quiz.id));
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------- entries */

  describe("score entry", () => {
    let membershipId: string;
    let assignmentId: string;

    beforeEach(async () => {
      const all = await t.db.select().from(memberships);
      const [founders] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Founders"));
      membershipId = all.find(
        (m) => m.teamId === founders.id && m.role === "member",
      )!.id;
      const [assignment] = await t.db
        .select()
        .from(metrics)
        .where(eq(metrics.key, "assignment"));
      assignmentId = assignment.id;
    });

    it("records a value and moves the score", async () => {
      const season = await getActiveSeason(t.db);
      const before = await getStandings(t.db, season!, TODAY);
      const beforeScore = before.members.find(
        (m) => m.membershipId === membershipId,
      )!.score;

      await setEntryValue(t.db, coach, {
        membershipId,
        metricId: assignmentId,
        value: 2,
      });

      const after = await getStandings(t.db, season!, TODAY);
      const afterScore = after.members.find(
        (m) => m.membershipId === membershipId,
      )!.score;
      expect(afterScore).toBeLessThan(beforeScore);
    });

    it("updates the existing value rather than duplicating it", async () => {
      await setEntryValue(t.db, coach, {
        membershipId,
        metricId: assignmentId,
        value: 3,
      });
      await setEntryValue(t.db, coach, {
        membershipId,
        metricId: assignmentId,
        value: 6,
      });

      const rows = await t.db
        .select()
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.membershipId, membershipId),
            eq(metricEntries.metricId, assignmentId),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(6);
    });

    it("tags the source by who recorded it", async () => {
      await setEntryValue(t.db, admin, {
        membershipId,
        metricId: assignmentId,
        value: 4,
      });
      const [row] = await t.db
        .select()
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.membershipId, membershipId),
            eq(metricEntries.metricId, assignmentId),
          ),
        );
      expect(row.source).toBe("admin");
      expect(row.decidedBy).toBe(admin.id);
    });

    it("stops a coach recording for another team's member", async () => {
      const all = await t.db.select().from(memberships);
      const [titans] = await t.db
        .select()
        .from(teams)
        .where(eq(teams.name, "Titans"));
      const other = all.find(
        (m) => m.teamId === titans.id && m.role === "member",
      )!;

      await expect(
        setEntryValue(t.db, coach, {
          membershipId: other.id,
          metricId: assignmentId,
          value: 5,
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("stops a plain member recording anything", async () => {
      await expect(
        setEntryValue(t.db, member, {
          membershipId,
          metricId: assignmentId,
          value: 8,
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects a value outside a manual score's range", async () => {
      const id = await createMetric(t.db, admin, seasonId, {
        name: "Leadership",
        type: "manual_score",
      });
      await expect(
        setEntryValue(t.db, admin, {
          membershipId,
          metricId: id,
          value: 11,
        }),
      ).rejects.toThrow(/0 to 10/);
    });

    it("rejects a negative value", async () => {
      await expect(
        setEntryValue(t.db, admin, {
          membershipId,
          metricId: assignmentId,
          value: -1,
        }),
      ).rejects.toThrow(/negative/);
    });
  });
});
