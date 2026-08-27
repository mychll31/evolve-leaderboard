import { PenaltiesManager } from "@/components/admin/PenaltiesManager";
import { getDb } from "@/db/client";
import { listPenalties, listPenaltyTargets } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";

export default async function AdminPenaltiesPage() {
  const ctx = await getAppContext();
  const db = getDb();
  const seasonId = ctx.standings.season.id;

  const [penalties, targets] = await Promise.all([
    listPenalties(db, seasonId),
    listPenaltyTargets(db, seasonId),
  ]);

  return <PenaltiesManager penalties={penalties} targets={targets} />;
}
