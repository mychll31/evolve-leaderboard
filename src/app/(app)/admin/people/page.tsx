import { PeopleManager } from "@/components/admin/PeopleManager";
import { getDb } from "@/db/client";
import { listPeople, listTeams } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";

export default async function AdminPeoplePage() {
  const ctx = await getAppContext();
  const db = getDb();
  const seasonId = ctx.standings.season.id;

  const [people, teams] = await Promise.all([
    listPeople(db, seasonId),
    listTeams(db, seasonId),
  ]);

  return (
    <PeopleManager
      seasonId={seasonId}
      people={people}
      teams={teams}
      currentUserId={ctx.user.id}
    />
  );
}
