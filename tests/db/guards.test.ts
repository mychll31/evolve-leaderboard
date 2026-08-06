import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberships, teams, users } from "@/db/schema";
import { seed } from "@/db/seed";
import {
  assertCanManageMembership,
  AuthorizationError,
  canManageMembership,
  coachTeamIds,
  ownMembership,
  type Actor,
} from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

const TODAY = new Date("2026-08-06T00:00:00.000Z");

describe("authorisation scoping", () => {
  let t: TestDb;
  let seasonId: string;
  let foundersCoach: Actor;
  let titansCoach: Actor;
  let member: Actor;
  let admin: Actor;
  let foundersMembershipId: string;
  let titansMembershipId: string;

  beforeAll(async () => {
    t = await makeTestDb();
    const result = await seed(t.db, { today: TODAY, adminEmail: "admin@core.example" });
    seasonId = result.seasonId;

    const teamRows = await t.db.select().from(teams);
    const founders = teamRows.find((x) => x.name === "Founders")!;
    const titans = teamRows.find((x) => x.name === "Titans")!;

    const all = await t.db.select().from(memberships);
    const foundersCoachRow = all.find(
      (m) => m.teamId === founders.id && m.role === "coach",
    )!;
    const titansCoachRow = all.find(
      (m) => m.teamId === titans.id && m.role === "coach",
    )!;
    const foundersMember = all.find(
      (m) => m.teamId === founders.id && m.role === "member",
    )!;
    const titansMember = all.find(
      (m) => m.teamId === titans.id && m.role === "member",
    )!;

    foundersMembershipId = foundersMember.id;
    titansMembershipId = titansMember.id;
    foundersCoach = { id: foundersCoachRow.userId, role: "user" };
    titansCoach = { id: titansCoachRow.userId, role: "user" };
    member = { id: foundersMember.userId, role: "user" };

    const [adminRow] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, "admin@core.example"));
    admin = { id: adminRow.id, role: "super_admin" };
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it("lists the teams a coach is responsible for", async () => {
    const ids = await coachTeamIds(t.db, foundersCoach.id, seasonId);
    expect(ids).toHaveLength(1);
  });

  it("gives a plain member no coached teams", async () => {
    expect(await coachTeamIds(t.db, member.id, seasonId)).toEqual([]);
  });

  it("lets a coach manage a member of their own team", async () => {
    expect(
      await canManageMembership(t.db, foundersCoach, foundersMembershipId),
    ).toBe(true);
  });

  it("stops a coach managing another team's member", async () => {
    expect(
      await canManageMembership(t.db, titansCoach, foundersMembershipId),
    ).toBe(false);
    await expect(
      assertCanManageMembership(t.db, titansCoach, foundersMembershipId),
    ).rejects.toThrow(AuthorizationError);
  });

  it("stops a member managing anyone, including themselves", async () => {
    expect(await canManageMembership(t.db, member, foundersMembershipId)).toBe(
      false,
    );
    expect(await canManageMembership(t.db, member, titansMembershipId)).toBe(
      false,
    );
  });

  it("lets a super admin manage any membership", async () => {
    expect(await canManageMembership(t.db, admin, foundersMembershipId)).toBe(
      true,
    );
    expect(await canManageMembership(t.db, admin, titansMembershipId)).toBe(
      true,
    );
  });

  it("denies rather than throws for a membership that does not exist", async () => {
    expect(
      await canManageMembership(t.db, foundersCoach, "no-such-membership"),
    ).toBe(false);
  });

  it("resolves a user's own membership for the season", async () => {
    const own = await ownMembership(t.db, member.id, seasonId);
    expect(own?.id).toBe(foundersMembershipId);
  });

  it("returns null when a user has no place in the season", async () => {
    expect(await ownMembership(t.db, "nobody", seasonId)).toBeNull();
  });
});
