import { AdminNav } from "@/components/admin/AdminNav";
import { requireSuperAdmin } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guarded once for the whole admin area. Each mutation guards again — a
  // hidden route is not access control.
  await requireSuperAdmin();

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
