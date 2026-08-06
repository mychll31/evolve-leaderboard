import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/guards";

export default async function AnalyticsRedirectPage() {
  await requireSuperAdmin();
  redirect("/admin/analytics");
}
