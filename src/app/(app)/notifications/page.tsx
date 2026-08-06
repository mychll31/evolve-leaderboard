import { NotificationList } from "@/components/notifications/NotificationList";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { listNotifications } from "@/db/queries/gamification";

export default async function NotificationsPage() {
  const ctx = await getAppContext();
  const rows = await listNotifications(getDb(), ctx.user.id);

  return <NotificationList notifications={rows} />;
}
