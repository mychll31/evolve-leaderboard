import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runWeeklyRollup } from "@/db/mutations/rollup";
import { seasons } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Scheduled weekly rollup, for Vercel Cron.
 *
 * Guarded by a bearer token. **Without `CRON_SECRET` set the route refuses
 * outright** rather than running unauthenticated — an unprotected endpoint
 * that rewrites every score is worse than a cron that never fires, because the
 * failure is silent.
 *
 * The rollup itself is idempotent, so a retried or duplicated invocation
 * converges on the same state.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const active = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.status, "active"));

  if (active.length === 0) {
    return NextResponse.json({ ran: 0, message: "No active season" });
  }

  const results = [];
  for (const season of active) {
    results.push({
      season: season.name,
      ...(await runWeeklyRollup(db, season.id)),
    });
  }

  return NextResponse.json({ ran: results.length, results });
}
