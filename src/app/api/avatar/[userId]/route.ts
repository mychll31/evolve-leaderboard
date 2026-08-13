import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userAvatars } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/guards";

/**
 * Serves a member's profile photo from the database.
 *
 * Signed-in only. These are photographs of real people in an invite-only
 * application, so they are not left readable by anyone who happens to have the
 * URL. That costs one session lookup on a cache miss, which the immutable
 * caching below makes rare.
 *
 * The bytes were never re-encoded — there is no image library on the server —
 * so the response headers do that job instead: `nosniff` stops the browser
 * second-guessing the declared type, and the sandboxed `default-src 'none'`
 * policy leaves a file that lied about being an image with nothing to run.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  if (!(await getSessionUser())) {
    return new Response("Not found", { status: 404 });
  }

  const { userId } = await ctx.params;

  const [avatar] = await getDb()
    .select()
    .from(userAvatars)
    .where(eq(userAvatars.userId, userId))
    .limit(1);

  if (!avatar) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(avatar.bytes), {
    headers: {
      "Content-Type": avatar.mime,
      "Content-Length": String(avatar.bytes.length),
      // Safe to keep forever because the URL carries an `?v=` stamped from
      // `updatedAt`, so new bytes always mean a new URL.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
