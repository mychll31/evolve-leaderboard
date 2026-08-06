import { CalendarManager } from "@/components/admin/CalendarManager";
import { getDb } from "@/db/client";
import { listMeetings } from "@/db/queries/admin";
import { getAppContext } from "@/db/queries/context";
import { isoToday } from "@/db/queries/standings";

export default async function AdminCalendarPage() {
  const ctx = await getAppContext();
  const meetings = await listMeetings(getDb(), ctx.standings.season.id);

  return (
    <CalendarManager
      seasonId={ctx.standings.season.id}
      seasonStart={ctx.standings.season.startsOn}
      seasonEnd={ctx.standings.season.endsOn}
      meetings={meetings}
      today={isoToday()}
    />
  );
}
