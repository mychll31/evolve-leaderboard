"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { deleteEntry, setEntryValue } from "@/db/mutations/entries";
import {
  ConflictError,
  NotFoundError,
  SeasonLockedError,
} from "@/db/mutations/guards";
import {
  createMeeting,
  deleteMeeting,
  generateMeetings,
  markHeldThrough,
  updateMeeting,
  type MeetingStatus,
  type RecurrenceInput,
} from "@/db/mutations/meetings";
import {
  createMetric,
  reorderMetrics,
  setMetricActive,
  updateMetric,
  type MetricInput,
} from "@/db/mutations/metrics";
import {
  addPenalty,
  deletePenalty,
  type PenaltyInput,
} from "@/db/mutations/penalties";
import {
  createUser,
  importMembers,
  setMembershipActive,
  updateUser,
  upsertMembership,
  type MembershipInput,
  type UserInput,
} from "@/db/mutations/people";
import {
  cloneSeason,
  createSeason,
  deleteSeason,
  setSeasonStatus,
  updateSeason,
  type SeasonInput,
  type SeasonStatus,
} from "@/db/mutations/seasons";
import {
  assignCoach,
  createTeam,
  deleteTeam,
  removeCoach,
  updateTeam,
  type TeamInput,
} from "@/db/mutations/teams";
import { requireUser } from "@/lib/auth/guards";
import { AuthorizationError } from "@/lib/auth/scoping";
import { parseMemberImport, type MemberImportRow } from "@/lib/csv";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ADMIN_PATHS = [
  "/admin",
  "/admin/teams",
  "/admin/people",
  "/admin/penalties",
  "/admin/import",
];

const SCORE_PATHS = ["/dashboard", "/leaderboard", "/teams", "/me", "/coach"];

/**
 * Shared error translation. The mutation layer throws typed errors; anything
 * unrecognised is reported generically rather than leaking internals.
 */
async function run<T>(
  fn: () => Promise<T>,
  paths: string[],
): Promise<ActionResult<T>> {
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

/* ------------------------------------------------------------------ seasons */

export async function createSeasonAction(input: SeasonInput) {
  const user = await requireUser();
  return run(() => createSeason(getDb(), user, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function updateSeasonAction(id: string, input: SeasonInput) {
  const user = await requireUser();
  return run(() => updateSeason(getDb(), user, id, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function deleteSeasonAction(id: string) {
  const user = await requireUser();
  return run(() => deleteSeason(getDb(), user, id), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function setSeasonStatusAction(id: string, status: SeasonStatus) {
  const user = await requireUser();
  return run(() => setSeasonStatus(getDb(), user, id, status), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function cloneSeasonAction(sourceId: string, input: SeasonInput) {
  const user = await requireUser();
  return run(() => cloneSeason(getDb(), user, sourceId, input), ADMIN_PATHS);
}

/* ----------------------------------------------------------------- calendar */

export async function generateMeetingsAction(
  seasonId: string,
  input: RecurrenceInput,
) {
  const user = await requireUser();
  return run(() => generateMeetings(getDb(), user, seasonId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function createMeetingAction(
  seasonId: string,
  input: {
    meetsOn: string;
    startTime: string;
    lateAfterMinutes: number;
    label?: string | null;
  },
) {
  const user = await requireUser();
  return run(() => createMeeting(getDb(), user, seasonId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function updateMeetingAction(
  meetingId: string,
  input: {
    startTime?: string;
    lateAfterMinutes?: number;
    label?: string | null;
    status?: MeetingStatus;
  },
) {
  const user = await requireUser();
  return run(() => updateMeeting(getDb(), user, meetingId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function deleteMeetingAction(meetingId: string) {
  const user = await requireUser();
  return run(() => deleteMeeting(getDb(), user, meetingId), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function markHeldThroughAction(seasonId: string, through: string) {
  const user = await requireUser();
  return run(() => markHeldThrough(getDb(), user, seasonId, through), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

/* -------------------------------------------------------------------- teams */

export async function createTeamAction(seasonId: string, input: TeamInput) {
  const user = await requireUser();
  return run(() => createTeam(getDb(), user, seasonId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function updateTeamAction(teamId: string, input: TeamInput) {
  const user = await requireUser();
  return run(() => updateTeam(getDb(), user, teamId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function deleteTeamAction(teamId: string) {
  const user = await requireUser();
  return run(() => deleteTeam(getDb(), user, teamId), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function assignCoachAction(teamId: string, userId: string) {
  const user = await requireUser();
  return run(() => assignCoach(getDb(), user, teamId, userId), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function removeCoachAction(teamId: string) {
  const user = await requireUser();
  return run(() => removeCoach(getDb(), user, teamId), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

/* ------------------------------------------------------------------- people */

export async function createUserAction(input: UserInput) {
  const user = await requireUser();
  return run(() => createUser(getDb(), user, input), ADMIN_PATHS);
}

export async function updateUserAction(userId: string, input: UserInput) {
  const user = await requireUser();
  return run(() => updateUser(getDb(), user, userId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function upsertMembershipAction(input: MembershipInput) {
  const user = await requireUser();
  return run(() => upsertMembership(getDb(), user, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function setMembershipActiveAction(
  membershipId: string,
  active: boolean,
) {
  const user = await requireUser();
  return run(() => setMembershipActive(getDb(), user, membershipId, active), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

/* ------------------------------------------------------------------- import */

export type ImportPreview = {
  rows: MemberImportRow[];
  issues: { line: number; message: string }[];
};

/** Parse only — never writes. The admin confirms before anything lands. */
export async function previewImportAction(
  text: string,
): Promise<ActionResult<ImportPreview>> {
  await requireUser();
  const parsed = parseMemberImport(text);
  return { ok: true, data: { rows: parsed.rows, issues: parsed.issues } };
}

export async function applyImportAction(
  seasonId: string,
  rows: MemberImportRow[],
) {
  const user = await requireUser();
  return run(() => importMembers(getDb(), user, seasonId, rows), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

/* ------------------------------------------------------------------ metrics */

export async function createMetricAction(seasonId: string, input: MetricInput) {
  const user = await requireUser();
  return run(() => createMetric(getDb(), user, seasonId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function updateMetricAction(metricId: string, input: MetricInput) {
  const user = await requireUser();
  return run(() => updateMetric(getDb(), user, metricId, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function setMetricActiveAction(metricId: string, active: boolean) {
  const user = await requireUser();
  return run(() => setMetricActive(getDb(), user, metricId, active), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

export async function reorderMetricsAction(
  seasonId: string,
  orderedIds: string[],
) {
  const user = await requireUser();
  return run(() => reorderMetrics(getDb(), user, seasonId, orderedIds), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
  ]);
}

/* ------------------------------------------------------------- score entry */

export async function setEntryValueAction(input: {
  membershipId: string;
  metricId: string;
  meetingId?: string | null;
  value: number;
  note?: string | null;
}) {
  const user = await requireUser();
  return run(() => setEntryValue(getDb(), user, input), [
    ...SCORE_PATHS,
    "/members",
  ]);
}

export async function deleteEntryAction(entryId: string) {
  const user = await requireUser();
  return run(() => deleteEntry(getDb(), user, entryId), [
    ...SCORE_PATHS,
    "/members",
  ]);
}

/* ------------------------------------------------------------- minus points */

export async function addPenaltyAction(input: PenaltyInput) {
  const user = await requireUser();
  return run(() => addPenalty(getDb(), user, input), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
    "/members",
    "/report",
  ]);
}

export async function deletePenaltyAction(penaltyId: string) {
  const user = await requireUser();
  return run(() => deletePenalty(getDb(), user, penaltyId), [
    ...ADMIN_PATHS,
    ...SCORE_PATHS,
    "/members",
    "/report",
  ]);
}
