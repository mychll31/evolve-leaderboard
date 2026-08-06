import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { seasons } from "@/db/schema";
import { AuthorizationError, type Actor } from "@/lib/auth/scoping";

export class SeasonLockedError extends Error {
  constructor(status: string) {
    super(
      status === "archived"
        ? "This season is archived and can no longer be changed"
        : "This season is locked. Unlock it to make changes.",
    );
    this.name = "SeasonLockedError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "super_admin") {
    throw new AuthorizationError("Only a Super Admin can do this");
  }
}

/**
 * Locking a season is a write barrier, not a visibility change: locked and
 * archived seasons stay fully readable so the record survives, but nothing can
 * be edited. Every mutation that touches season data calls this first.
 */
export async function assertSeasonWritable(
  db: Database,
  seasonId: string,
): Promise<void> {
  const [season] = await db
    .select({ status: seasons.status })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  if (!season) throw new NotFoundError("Season");
  if (season.status === "locked" || season.status === "archived") {
    throw new SeasonLockedError(season.status);
  }
}
