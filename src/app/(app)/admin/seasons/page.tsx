import { SeasonsManager } from "@/components/admin/SeasonsManager";
import { getDb } from "@/db/client";
import { listSeasons } from "@/db/queries/admin";

export default async function AdminSeasonsPage() {
  const seasons = await listSeasons(getDb());
  return <SeasonsManager seasons={seasons} />;
}
