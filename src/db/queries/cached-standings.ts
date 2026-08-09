import { eq } from "drizzle-orm";
import { revalidateTag, unstable_cache, updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { seasons } from "@/db/schema";
import { getStandings, type SeasonRow, type Standings } from "./standings";

/**
 * Standings, cached across requests.
 *
 * Every screen reads the whole season through `getStandings`, which is six
 * queries — the largest single wait on a page, and identical for every viewer
 * until someone logs something. Against a local file database that costs 4ms
 * and caching would be pointless; against Turso each wait is a network round
 * trip, which is where the page time actually goes.
 *
 * `unstable_cache` rather than `use cache`: the latter needs the Cache
 * Components model turned on for the whole app, which is a far larger change
 * than a performance fix should make.
 */

/**
 * One tag for every season. Over-invalidating across seasons costs a single
 * recompute, and it removes any chance of a write path forgetting which season
 * it touched — which would leave a member looking at a stale score after they
 * had just logged something.
 */
export const STANDINGS_TAG = "standings";

/**
 * From a Server Action, after anything that can move a score.
 *
 * `updateTag` expires the entry outright, so the member who just logged sees
 * their new score on the next render. `revalidateTag(tag, "max")` would serve
 * them the stale copy while refreshing behind their back.
 */
export function updateStandings(): void {
  updateTag(STANDINGS_TAG);
}

/**
 * From a Route Handler, where `updateTag` is not allowed. Stale-while-
 * revalidate is right here: the weekly rollup has nobody waiting on it.
 *
 * Best-effort on purpose. The rollup handler is also called directly by tests
 * and could be by a script, and outside a request there is no cache to expire
 * — that should not fail a rollup that has already written its snapshots.
 */
export function expireStandings(): void {
  try {
    revalidateTag(STANDINGS_TAG, "max");
  } catch {
    // No request context: nothing is cached, so nothing to invalidate.
  }
}

/**
 * The cache stores JSON, so `createdAt` returns as a string. Reviving it keeps
 * `SeasonRow` honest rather than leaving a Date-typed field holding a string
 * for someone to trip over later.
 */
function reviveSeason(season: SeasonRow): SeasonRow {
  return { ...season, createdAt: new Date(season.createdAt) };
}

export async function getCachedStandings(
  season: SeasonRow,
): Promise<Standings> {
  const load = unstable_cache(
    async (seasonId: string): Promise<Standings | null> => {
      const db = getDb();
      // Read the season inside the cache boundary so the whole payload comes
      // from the database: a renamed or locked season cannot go stale behind
      // an id that never changed.
      const [row] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1);
      if (!row) return null;
      return getStandings(db, row);
    },
    ["standings"],
    { tags: [STANDINGS_TAG], revalidate: 60 },
  );

  const cached = await load(season.id);
  // Null means the season disappeared between the two reads. Fall back rather
  // than fail: the caller already holds a valid season row.
  if (!cached) return getStandings(getDb(), season);
  return { ...cached, season: reviveSeason(cached.season) };
}
