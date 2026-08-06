import { TeamsManager } from "@/components/admin/TeamsManager";
import { getDb } from "@/db/client";
import { listPeople, listTeams } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";

export default async function AdminTeamsPage() {
  const ctx = await getAppContext();
  const db = getDb();
  const seasonId = ctx.standings.season.id;

  const [teams, people] = await Promise.all([
    listTeams(db, seasonId),
    listPeople(db, seasonId),
  ]);

  return <TeamsManager seasonId={seasonId} teams={teams} people={people} />;
}
