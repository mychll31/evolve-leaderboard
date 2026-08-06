import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, teams } from "@/db/schema";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

export type TeamInput = {
  name: string;
  abbr: string;
  color: string;
  sortOrder?: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function validate(input: TeamInput): void {
  if (!input.name.trim()) throw new ConflictError("Team name is required");
  if (!input.abbr.trim()) throw new ConflictError("Abbreviation is required");
  if (input.abbr.trim().length > 4) {
    throw new ConflictError("Abbreviation must be four characters or fewer");
  }
  if (!HEX.test(input.color)) {
    throw new ConflictError("Colour must be a hex value like #12B5CB");
  }
}

export async function createTeam(
  db: Database,
  actor: Actor,
  seasonId: string,
  input: TeamInput,
): Promise<string> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);
  validate(input);

  const existing = await db
    .select({ name: teams.name, sortOrder: teams.sortOrder })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));

  if (
    existing.some(
      (t) => t.name.toLowerCase() === input.name.trim().toLowerCase(),
    )
  ) {
    throw new ConflictError(`There is already a team called ${input.name}`);
  }

  const [row] = await db
    .insert(teams)
    .values({
      seasonId,
      name: input.name.trim(),
      abbr: input.abbr.trim().toUpperCase(),
      color: input.color,
      sortOrder:
        input.sortOrder ??
        existing.reduce((max, t) => Math.max(max, t.sortOrder + 1), 0),
    })
    .returning({ id: teams.id });

  return row.id;
}

export async function updateTeam(
  db: Database,
  actor: Actor,
  teamId: string,
  input: TeamInput,
): Promise<void> {
  assertAdmin(actor);
  validate(input);

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team");
  await assertSeasonWritable(db, team.seasonId);

  const siblings = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.seasonId, team.seasonId));

  if (
    siblings.some(
      (t) =>
        t.id !== teamId &&
        t.name.toLowerCase() === input.name.trim().toLowerCase(),
    )
  ) {
    throw new ConflictError(`There is already a team called ${input.name}`);
  }

  await db
    .update(teams)
    .set({
      name: input.name.trim(),
      abbr: input.abbr.trim().toUpperCase(),
      color: input.color,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    .where(eq(teams.id, teamId));
}

/**
 * Deletes a team. Refused while anyone still belongs to it — the cascade would
 * take their memberships, and with them every entry, snapshot and badge.
 */
export async function deleteTeam(
  db: Database,
  actor: Actor,
  teamId: string,
): Promise<void> {
  assertAdmin(actor);

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team");
  await assertSeasonWritable(db, team.seasonId);

  const roster = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.teamId, teamId));

  if (roster.length > 0) {
    throw new ConflictError(
      `${team.name} still has ${roster.length} member${roster.length === 1 ? "" : "s"}. Move them to another team first.`,
    );
  }

  await db.delete(teams).where(eq(teams.id, teamId));
}

/**
 * Assigns or replaces a team's coach.
 *
 * `UNIQUE(season_id, user_id)` means one place per person per season, so the
 * outgoing coach is deactivated rather than deleted — that keeps the coaching
 * history the brief asks for. If the incoming coach already holds a membership
 * this season, it is reassigned instead of inserted, which is the only way to
 * avoid colliding with that same constraint.
 */
export async function assignCoach(
  db: Database,
  actor: Actor,
  teamId: string,
  userId: string,
): Promise<void> {
  assertAdmin(actor);

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team");
  await assertSeasonWritable(db, team.seasonId);

  const current = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.teamId, teamId),
        eq(memberships.role, "coach"),
        eq(memberships.active, true),
      ),
    );

  for (const coach of current) {
    if (coach.userId === userId) return; // already coaching this team
    await db
      .update(memberships)
      .set({ active: false })
      .where(eq(memberships.id, coach.id));
  }

  const [existing] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.seasonId, team.seasonId),
        eq(memberships.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(memberships)
      .set({ teamId, role: "coach", active: true })
      .where(eq(memberships.id, existing.id));
    return;
  }

  await db.insert(memberships).values({
    seasonId: team.seasonId,
    teamId,
    userId,
    role: "coach",
    active: true,
  });
}

export async function removeCoach(
  db: Database,
  actor: Actor,
  teamId: string,
): Promise<void> {
  assertAdmin(actor);

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team");
  await assertSeasonWritable(db, team.seasonId);

  await db
    .update(memberships)
    .set({ active: false })
    .where(
      and(eq(memberships.teamId, teamId), eq(memberships.role, "coach")),
    );
}
