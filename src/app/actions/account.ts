"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { updateStandings } from "@/db/queries/cached-standings";
import {
  changeOwnPassword,
  removeAvatar,
  saveAvatar,
  updateOwnName,
  type AvatarMime,
} from "@/db/mutations/account";
import { ConflictError, NotFoundError } from "@/db/mutations/guards";
import { requireUser } from "@/lib/auth/guards";
import { AuthorizationError } from "@/lib/auth/scoping";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * A name or a photo shows up on the leaderboard, the podium, and every team
 * roster, so an account edit has to invalidate the same paths an admin edit
 * does.
 */
const ACCOUNT_PATHS = [
  "/account",
  "/dashboard",
  "/leaderboard",
  "/teams",
  "/me",
  "/coach",
  "/admin/people",
];

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  updateStandings();
  for (const path of ACCOUNT_PATHS) revalidatePath(path);
  return { ok: true };
}

export async function updateOwnNameAction(name: string): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => updateOwnName(getDb(), user, user.id, name));
}

export async function changeOwnPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => changeOwnPassword(getDb(), user, input));
}

/**
 * The cropper hands over a base64 data URL because that survives the Server
 * Action boundary without a multipart form. A 256px WebP is roughly 30KB, well
 * inside the 1MB action body limit, and the byte cap in `saveAvatar` is the
 * real guard.
 */
export async function saveAvatarAction(input: {
  mime: AvatarMime;
  base64: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  return run(() =>
    saveAvatar(getDb(), user, {
      mime: input.mime,
      bytes: Buffer.from(input.base64, "base64"),
    }),
  );
}

export async function removeAvatarAction(): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => removeAvatar(getDb(), user));
}
