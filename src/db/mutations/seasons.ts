import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, metrics, seasons, teams } from "@/db/schema";
import type { Formula } from "@/domain/types";
import type { Actor } from "@/lib/auth/scoping";
import {
  ConflictError,
  NotFoundError,
  assertAdmin,
  assertSeasonWritable,
} from "./guards";

export type SeasonStatus = "draft" | "active" | "locked" | "archived";

export type SeasonInput = {
  name: string;
  startsOn: string;
  endsOn: string;
  formula?: Formula;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: SeasonInput): void {
  if (!input.name.trim()) throw new ConflictError("Season name is required");
  if (!ISO_DATE.test(input.startsOn) || !ISO_DATE.test(input.endsOn)) {
    throw new ConflictError("Dates must be in YYYY-MM-DD format");
  }
  if (input.endsOn <= input.startsOn) {
    throw new ConflictError("The season must end after it starts");
  }
}

export async function createSeason(
  db: Database,
  actor: Actor,
  input: SeasonInput,
): Promise<string> {
  assertAdmin(actor);
  validate(input);

  const [row] = await db
    .insert(seasons)
    .values({
      name: input.name.trim(),
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      formula: input.formula ?? "weighted",
      status: "draft",
    })
    .returning({ id: seasons.id });

  return row.id;
}

export async function updateSeason(
  db: Database,
  actor: Actor,
  seasonId: string,
  input: SeasonInput,
): Promise<void> {
  assertAdmin(actor);
  await assertSeasonWritable(db, seasonId);
  validate(input);

  await db
    .update(seasons)
    .set({
      name: input.name.trim(),
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      ...(input.formula ? { formula: input.formula } : {}),
    })
    .where(eq(seasons.id, seasonId));
}

/**
 * Permanently removes a season and all of its season-scoped data.
 *
 * Active and locked seasons must go through the lifecycle first. That keeps
 * admins from deleting the live leaderboard by accident or bypassing the
 * explicit archive step for frozen results.
 */
export async function deleteSeason(
  db: Database,
  actor: Actor,
  seasonId: string,
): Promise<void> {
  assertAdmin(actor);

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) throw new NotFoundError("Season");

  if (season.status === "active") {
    throw new ConflictError(
      "The active season cannot be deleted. Lock and archive it first.",
    );
  }
  if (season.status === "locked") {
    throw new ConflictError(
      "Locked seasons must be archived before they can be deleted.",
    );
  }

  await db.delete(seasons).where(eq(seasons.id, seasonId));
}

/**
 * Moves a season through its lifecycle.
 *
 * Exactly one season may be active, so activating one locks whichever was
 * active before. Writes are sequential rather than transactional: Turso speaks
 * libSQL over HTTP, where interactive transactions add failure modes that buy
 * little here — this is a single-admin action, and two briefly-active seasons
 * would still render correctly because `getActiveSeason` takes the most recent.
 */
export async function setSeasonStatus(
  db: Database,
  actor: Actor,
  seasonId: string,
  status: SeasonStatus,
): Promise<void> {
  assertAdmin(actor);

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) throw new NotFoundError("Season");

  if (season.status === "archived" && status !== "archived") {
    throw new ConflictError("An archived season cannot be reopened");
  }

  if (status === "active") {
    await db
      .update(seasons)
      .set({ status: "locked" })
      .where(and(eq(seasons.status, "active"), ne(seasons.id, seasonId)));
  }

  await db.update(seasons).set({ status }).where(eq(seasons.id, seasonId));
}

/**
 * Clones a season's *structure* — teams, metrics and coach assignments.
 *
 * Deliberately not member memberships, entries, snapshots or badges. Rosters
 * change between seasons, and silently carrying last season's forward would be
 * harder to notice and undo than re-adding people deliberately.
 */
export async function cloneSeason(
  db: Database,
  actor: Actor,
  sourceSeasonId: string,
  input: SeasonInput,
): Promise<string> {
  assertAdmin(actor);

  const [source] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, sourceSeasonId))
    .limit(1);
  if (!source) throw new NotFoundError("Season");

  const newSeasonId = await createSeason(db, actor, {
    ...input,
    formula: input.formula ?? source.formula,
  });

  const [sourceTeams, sourceMetrics] = await Promise.all([
    db.select().from(teams).where(eq(teams.seasonId, sourceSeasonId)),
    db.select().from(metrics).where(eq(metrics.seasonId, sourceSeasonId)),
  ]);

  const teamIdMap = new Map<string, string>();
  if (sourceTeams.length > 0) {
    const created = await db
      .insert(teams)
      .values(
        sourceTeams.map((team) => ({
          seasonId: newSeasonId,
          name: team.name,
          abbr: team.abbr,
          color: team.color,
          sortOrder: team.sortOrder,
        })),
      )
      .returning({ id: teams.id, name: teams.name });

    for (const team of sourceTeams) {
      const match = created.find((c) => c.name === team.name);
      if (match) teamIdMap.set(team.id, match.id);
    }
  }

  if (sourceMetrics.length > 0) {
    await db.insert(metrics).values(
      sourceMetrics.map((metric) => ({
        seasonId: newSeasonId,
        key: metric.key,
        name: metric.name,
        type: metric.type,
        weight: metric.weight,
        target: metric.target,
        required: metric.required,
        sortOrder: metric.sortOrder,
        active: metric.active,
      })),
    );
  }

  const coaches = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.seasonId, sourceSeasonId),
        eq(memberships.role, "coach"),
      ),
    );

  const carried = coaches
    .map((coach) => ({ coach, teamId: teamIdMap.get(coach.teamId) }))
    .filter((c): c is { coach: (typeof coaches)[number]; teamId: string } =>
      Boolean(c.teamId),
    );

  if (carried.length > 0) {
    await db.insert(memberships).values(
      carried.map(({ coach, teamId }) => ({
        seasonId: newSeasonId,
        teamId,
        userId: coach.userId,
        role: "coach" as const,
        position: coach.position,
      })),
    );
  }

  return newSeasonId;
}
