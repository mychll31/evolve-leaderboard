"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import {
  ConflictError,
  NotFoundError,
  SeasonLockedError,
  assertAdmin,
  assertSeasonWritable,
} from "@/db/mutations/guards";
import { runWeeklyRollup, weekNoFor } from "@/db/mutations/rollup";
import { badges, memberships, notifications, seasons, weeklyAwards } from "@/db/schema";
import {
  parseBadgeRule,
  serializeBadgeRule,
  type BadgeRule,
} from "@/domain/badges";
import { requireUser } from "@/lib/auth/guards";
import { AuthorizationError, assertCanManageMembership } from "@/lib/auth/scoping";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ALL_PATHS = [
  "/dashboard",
  "/leaderboard",
  "/teams",
  "/me",
  "/coach",
  "/analytics",
  "/admin/analytics",
  "/notifications",
  "/admin",
  "/admin/badges",
];

async function run<T>(fn: () => Promise<T>, paths: string[]): Promise<ActionResult<T>> {
  let data: T;
  try {
    data = await fn();
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof SeasonLockedError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  for (const path of paths) revalidatePath(path);
  return { ok: true, data };
}

/* -------------------------------------------------------------------- rollup */

export async function runRollupAction(seasonId: string) {
  const user = await requireUser();
  return run(async () => {
    assertAdmin(user);
    return runWeeklyRollup(getDb(), seasonId);
  }, ALL_PATHS);
}

/* ------------------------------------------------------------- notifications */

export async function markNotificationReadAction(id: string) {
  const user = await requireUser();
  return run(async () => {
    // Scoped by userId, so one member can never mark another's as read.
    await getDb()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, user.id)),
      );
  }, ["/notifications", "/dashboard"]);
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  return run(async () => {
    await getDb()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
        ),
      );
  }, ["/notifications", "/dashboard"]);
}

/* -------------------------------------------------------------- coach choice */

export async function nominateCoachChoiceAction(
  seasonId: string,
  membershipId: string,
  note: string | null,
) {
  const user = await requireUser();
  return run(async () => {
    const db = getDb();
    await assertCanManageMembership(db, user, membershipId);
    await assertSeasonWritable(db, seasonId);

    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundError("Season");

    const [membership] = await db
      .select({ teamId: memberships.teamId })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .limit(1);
    if (!membership) throw new NotFoundError("Membership");

    const weekNo = weekNoFor(season.startsOn, new Date());

    // Leader's choice is one nomination per team per week, which is what the
    // composite unique key on (season, week, category, team) encodes.
    await db
      .insert(weeklyAwards)
      .values({
        seasonId,
        weekNo,
        category: "coach_choice",
        membershipId,
        teamId: membership.teamId,
        note,
        awardedBy: user.id,
      })
      .onConflictDoUpdate({
        target: [
          weeklyAwards.seasonId,
          weeklyAwards.weekNo,
          weeklyAwards.category,
          weeklyAwards.teamId,
        ],
        set: { membershipId, note, awardedBy: user.id },
      });

    return { weekNo };
  }, ALL_PATHS);
}

/* --------------------------------------------------------------- badge CRUD */

export type BadgeInput = {
  icon: string;
  name: string;
  requirementText: string;
  rule: BadgeRule | null;
};

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "badge"
  );
}

function validate(input: BadgeInput): void {
  if (!input.name.trim()) throw new ConflictError("Badge name is required");
  if (!input.icon.trim()) throw new ConflictError("Pick an icon");
  if (!input.requirementText.trim()) {
    throw new ConflictError("Describe what earns this badge");
  }
  if (input.rule && !parseBadgeRule(serializeBadgeRule(input.rule))) {
    throw new ConflictError("That rule is not valid");
  }
}

export async function createBadgeAction(input: BadgeInput) {
  const user = await requireUser();
  return run(async () => {
    assertAdmin(user);
    validate(input);
    const db = getDb();

    const existing = await db.select({ key: badges.key, sortOrder: badges.sortOrder }).from(badges);
    const base = slugify(input.name);
    let key = base;
    let suffix = 2;
    while (existing.some((b) => b.key === key)) key = `${base}-${suffix++}`;

    await db.insert(badges).values({
      key,
      icon: input.icon.trim(),
      name: input.name.trim(),
      requirementText: input.requirementText.trim(),
      ruleJson: input.rule ? serializeBadgeRule(input.rule) : null,
      sortOrder: existing.reduce((max, b) => Math.max(max, b.sortOrder + 1), 0),
    });
  }, ALL_PATHS);
}

export async function updateBadgeAction(badgeId: string, input: BadgeInput) {
  const user = await requireUser();
  return run(async () => {
    assertAdmin(user);
    validate(input);
    await getDb()
      .update(badges)
      .set({
        icon: input.icon.trim(),
        name: input.name.trim(),
        requirementText: input.requirementText.trim(),
        ruleJson: input.rule ? serializeBadgeRule(input.rule) : null,
      })
      .where(eq(badges.id, badgeId));
  }, ALL_PATHS);
}

export async function setBadgeActiveAction(badgeId: string, active: boolean) {
  const user = await requireUser();
  return run(async () => {
    assertAdmin(user);
    await getDb().update(badges).set({ active }).where(eq(badges.id, badgeId));
  }, ALL_PATHS);
}
