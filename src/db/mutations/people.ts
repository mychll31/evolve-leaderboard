import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, teams, users } from "@/db/schema";
import type { MemberImportRow } from "@/lib/csv";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserInput = {
  name: string;
  email: string;
  role?: "super_admin" | "user";
};

export async function createUser(
  db: Database,
  actor: Actor,
  input: UserInput,
): Promise<string> {
  assertAdmin(actor);

  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) throw new ConflictError("Name is required");
  if (!EMAIL.test(email)) throw new ConflictError("A valid email is required");

  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (clash) throw new ConflictError(`${email} is already on the roster`);

  const [row] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email,
      role: input.role ?? "user",
    })
    .returning({ id: users.id });

  return row.id;
}

export async function updateUser(
  db: Database,
  actor: Actor,
  userId: string,
  input: UserInput,
): Promise<void> {
  assertAdmin(actor);

  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) throw new ConflictError("Name is required");
  if (!EMAIL.test(email)) throw new ConflictError("A valid email is required");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) throw new NotFoundError("User");

  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (clash && clash.id !== userId) {
    throw new ConflictError(`${email} belongs to someone else`);
  }

  // Guard against an admin removing their own admin rights and locking the
  // whole console. There is no other route back in.
  if (input.role && input.role !== "super_admin" && userId === actor.id) {
    throw new ConflictError("You cannot remove your own admin access");
  }

  await db
    .update(users)
    .set({
      name: input.name.trim(),
      email,
      ...(input.role ? { role: input.role } : {}),
    })
    .where(eq(users.id, userId));
}

export type MembershipInput = {
  seasonId: string;
  userId: string;
  teamId: string;
  role?: "member" | "coach";
  position?: string | null;
};

/**
 * Places someone on a team for a season.
 *
 * `UNIQUE(season_id, user_id)` allows one place per person per season, so an
 * existing membership is moved rather than duplicated — that is what makes
 * "transfer to another team" work without dropping their entries, which hang
 * off the membership id.
 */
export async function upsertMembership(
  db: Database,
  actor: Actor,
  input: MembershipInput,
): Promise<string> {
  assertAdmin(actor);
  await assertSeasonWritable(db, input.seasonId);

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, input.teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team");
  if (team.seasonId !== input.seasonId) {
    throw new ConflictError("That team belongs to a different season");
  }

  const [existing] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.seasonId, input.seasonId),
        eq(memberships.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(memberships)
      .set({
        teamId: input.teamId,
        role: input.role ?? existing.role,
        position:
          input.position !== undefined ? input.position : existing.position,
        active: true,
      })
      .where(eq(memberships.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(memberships)
    .values({
      seasonId: input.seasonId,
      teamId: input.teamId,
      userId: input.userId,
      role: input.role ?? "member",
      position: input.position ?? null,
      active: true,
    })
    .returning({ id: memberships.id });

  return row.id;
}

/**
 * Removes someone from the season's active roster without deleting anything.
 * Their entries, snapshots and badges survive; they simply stop appearing in
 * standings.
 */
export async function setMembershipActive(
  db: Database,
  actor: Actor,
  membershipId: string,
  active: boolean,
): Promise<void> {
  assertAdmin(actor);

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership) throw new NotFoundError("Membership");
  await assertSeasonWritable(db, membership.seasonId);

  await db
    .update(memberships)
    .set({ active })
    .where(eq(memberships.id, membershipId));
}

export type ImportOutcome = {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
};

/**
 * Applies parsed import rows. Validation and preview happen in `lib/csv`; this
 * only writes, and refuses the whole batch if any team name is unknown, so an
 * admin is never left guessing which half of a file landed.
 */
export async function importMembers(
  db: Database,
  actor: Actor,
  seasonId: string,
  rows: MemberImportRow[],
): Promise<ImportOutcome> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);

  const seasonTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));

  const teamByName = new Map(
    seasonTeams.map((t) => [t.name.trim().toLowerCase(), t.id]),
  );

  const errors: { line: number; message: string }[] = [];
  for (const row of rows) {
    if (!teamByName.has(row.team.trim().toLowerCase())) {
      errors.push({
        line: row.line,
        message: `No team called "${row.team}" in this season`,
      });
    }
  }
  if (errors.length > 0) return { created: 0, updated: 0, errors };

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const teamId = teamByName.get(row.team.trim().toLowerCase())!;

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, row.email))
      .limit(1);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await db
        .update(users)
        .set({ name: row.name })
        .where(eq(users.id, userId));
      updated++;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({ name: row.name, email: row.email })
        .returning({ id: users.id });
      userId = inserted.id;
      created++;
    }

    await upsertMembership(db, actor, {
      seasonId,
      userId,
      teamId,
      role: row.role,
      position: row.position,
    });
  }

  return { created, updated, errors: [] };
}
