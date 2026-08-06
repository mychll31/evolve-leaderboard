import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberships, seasons, teams, users } from "@/db/schema";
import { hasDevelopmentAuthBypass } from "./guards";

/**
 * Development-only account picker.
 *
 * Switching between the three roles used to mean editing `AUTH_DEV_EMAIL` and
 * restarting the dev server. This lists the real seeded accounts so a role
 * change is one click.
 *
 * Every function here returns empty unless `hasDevelopmentAuthBypass()` is
 * true, which is itself false in any production build.
 */

export type DevAccount = {
  id: string;
  name: string;
  email: string;
  /** Which of the three roles this account demonstrates. */
  label: "Super Admin" | "Coach" | "Member";
  teamName: string | null;
};

export async function listDevelopmentAccounts(): Promise<DevAccount[]> {
  if (!hasDevelopmentAuthBypass()) return [];

  const db = getDb();

  const [active] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "active"))
    .limit(1);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      globalRole: users.role,
      seasonRole: memberships.role,
      teamName: teams.name,
    })
    .from(users)
    .leftJoin(
      memberships,
      active
        ? and(
            eq(memberships.userId, users.id),
            eq(memberships.seasonId, active.id),
            eq(memberships.active, true),
          )
        : eq(memberships.userId, users.id),
    )
    .leftJoin(teams, eq(teams.id, memberships.teamId))
    .orderBy(asc(users.name));

  return rows
    .filter((row) => row.email)
    .map((row) => ({
      id: row.id,
      name: row.name ?? row.email ?? "Unknown",
      email: row.email ?? "",
      teamName: row.teamName,
      // Global admin wins: a super admin who also plays is still the account
      // you reach for when you want to see the admin console.
      label:
        row.globalRole === "super_admin"
          ? ("Super Admin" as const)
          : row.seasonRole === "coach"
            ? ("Coach" as const)
            : ("Member" as const),
    }));
}

/**
 * One representative account per role, in the order the roles escalate. This
 * is what the sign-in page offers as its three primary buttons.
 */
export async function listDevelopmentRoleSamples(): Promise<DevAccount[]> {
  const accounts = await listDevelopmentAccounts();
  const order: DevAccount["label"][] = ["Super Admin", "Coach", "Member"];

  return order
    .map((label) => accounts.find((account) => account.label === label))
    .filter((account): account is DevAccount => Boolean(account));
}
