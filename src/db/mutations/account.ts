import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { userAvatars, users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { AuthorizationError, type Actor } from "@/lib/auth/scoping";
import { ConflictError, NotFoundError } from "./guards";
import { setPassword } from "./password";

/**
 * Everything a person can change about their own account.
 *
 * These are the same writes an admin already has through `people.ts`, taken
 * from the other side: the actor is usually the subject rather than a super
 * admin, so authorisation is owner-or-admin rather than admin-only.
 */

/** Small enough to sit in a row comfortably; a 256px WebP is a fraction of it. */
export const MAX_AVATAR_BYTES = 200 * 1024;

export type AvatarMime = "image/webp" | "image/jpeg" | "image/png";

function assertSelfOrAdmin(actor: Actor, userId: string): void {
  if (actor.id !== userId && actor.role !== "super_admin") {
    throw new AuthorizationError("Not permitted");
  }
}

export async function updateOwnName(
  db: Database,
  actor: Actor,
  userId: string,
  name: string,
): Promise<void> {
  assertSelfOrAdmin(actor, userId);

  const trimmed = name.trim();
  if (!trimmed) throw new ConflictError("Name is required");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) throw new NotFoundError("Account");

  await db.update(users).set({ name: trimmed }).where(eq(users.id, userId));
}

/**
 * Changing a password requires the current one — a signed-in session is not
 * proof enough on a shared or unlocked device.
 *
 * The exception is an account that has no password at all, which is the normal
 * state for someone who has only ever used Google. They are already
 * authenticated, so there is nothing to re-prove, and this is how most people
 * will get a password without an admin having to mint a link.
 */
export async function changeOwnPassword(
  db: Database,
  actor: Actor,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!user) throw new NotFoundError("Account");

  if (user.passwordHash) {
    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) throw new ConflictError("That is not your current password");
  }

  await setPassword(db, actor.id, input.newPassword);
}

/**
 * There is no image library on the server, so the bytes cannot be re-encoded
 * to strip whatever might be hiding in them. What is checked here is the size
 * and that the leading bytes match the declared type; the avatar route then
 * serves everything with `nosniff` and a `default-src 'none'` policy, so a file
 * that lied about being an image has nothing to execute in.
 */
function assertLooksLikeImage(mime: AvatarMime, bytes: Buffer): void {
  const ok =
    (mime === "image/webp" &&
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") ||
    (mime === "image/jpeg" &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (mime === "image/png" &&
      bytes.length >= 8 &&
      bytes.toString("hex", 0, 8) === "89504e470d0a1a0a");

  if (!ok) throw new ConflictError("That file is not a valid image");
}

export async function saveAvatar(
  db: Database,
  actor: Actor,
  input: { mime: AvatarMime; bytes: Buffer },
): Promise<void> {
  if (input.bytes.length > MAX_AVATAR_BYTES) {
    throw new ConflictError("That image is too large");
  }
  assertLooksLikeImage(input.mime, input.bytes);

  const updatedAt = new Date();

  await db
    .insert(userAvatars)
    .values({
      userId: actor.id,
      mime: input.mime,
      bytes: input.bytes,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { mime: input.mime, bytes: input.bytes, updatedAt },
    });

  // The version makes the URL change whenever the bytes do, which is what lets
  // the route serve avatars with a long immutable cache.
  await db
    .update(users)
    .set({ image: `/api/avatar/${actor.id}?v=${updatedAt.getTime()}` })
    .where(eq(users.id, actor.id));
}

export async function removeAvatar(db: Database, actor: Actor): Promise<void> {
  await db.delete(userAvatars).where(eq(userAvatars.userId, actor.id));
  await db.update(users).set({ image: null }).where(eq(users.id, actor.id));
}
