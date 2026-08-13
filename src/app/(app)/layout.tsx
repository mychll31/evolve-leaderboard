import { BottomNav } from "@/components/shell/BottomNav";
import { Sidebar } from "@/components/shell/Sidebar";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { TopBar } from "@/components/shell/TopBar";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { requireUser } from "@/lib/auth/guards";
import { countUnread } from "@/db/queries/gamification";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Counting notifications only needs the user id, so it runs alongside the
  // season load rather than waiting a whole round trip behind it. The session
  // lookup is request-cached, so asking for it here costs nothing extra.
  const user = await requireUser();
  const [ctx, unreadCount] = await Promise.all([
    getAppContext(),
    countUnread(getDb(), user.id),
  ]);
  const own = ctx.membershipId
    ? ctx.standings.members.find((m) => m.membershipId === ctx.membershipId)
    : undefined;

  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  const roleLabel = ctx.isAdmin
    ? "Super Admin"
    : ctx.coachedTeams.length > 0
      ? "Leader"
      : "Member";

  return (
    <div className="bg-surface flex min-h-dvh">
      <Sidebar
        seasonName="Leaderboard"
        userName={name}
        roleLabel={roleLabel}
        teamName={own?.teamName ?? ctx.coachedTeams[0]?.name ?? null}
        initials={name.slice(0, 2).toUpperCase()}
        image={ctx.user.image ?? null}
        isCoach={ctx.isCoach}
        isAdmin={ctx.isAdmin}
        signOut={<SignOutButton />}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          isCoach={ctx.isCoach}
          isAdmin={ctx.isAdmin}
          unreadCount={unreadCount}
          userName={name}
          initials={name.slice(0, 2).toUpperCase()}
          image={ctx.user.image ?? null}
          subLabel={own?.teamName ?? ctx.coachedTeams[0]?.name ?? roleLabel}
          signOut={<SignOutButton variant="panel" />}
        />
        <main className="flex-1 px-4 pt-5 pb-28 sm:px-8 sm:pt-7 lg:pb-11">
          {children}
        </main>
      </div>

      <BottomNav isCoach={ctx.isCoach} isAdmin={ctx.isAdmin} />
    </div>
  );
}
