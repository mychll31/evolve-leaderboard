import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userAvatars, users } from "@/db/schema";
import {
  MAX_AVATAR_BYTES,
  changeOwnPassword,
  removeAvatar,
  saveAvatar,
  updateOwnName,
} from "@/db/mutations/account";
import { authenticateWithPassword } from "@/db/mutations/password";
import { hashPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/scoping";
import { makeTestDb, type TestDb } from "../helpers/db";

/** A minimal but structurally honest WebP header: "RIFF....WEBP". */
function webpBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(size - 8, 4);
  buf.write("WEBP", 8, "ascii");
  return buf;
}

const PASSWORD = "the current password";

describe("account mutations", () => {
  let t: TestDb;
  let pat: Actor;
  let admin: Actor;
  let stranger: Actor;

  beforeAll(async () => {
    t = await makeTestDb();

    const [patRow] = await t.db
      .insert(users)
      .values({
        name: "Pat Member",
        email: "pat@core.example",
        passwordHash: await hashPassword(PASSWORD),
      })
      .returning({ id: users.id });
    pat = { id: patRow.id, role: "user" };

    const [adminRow] = await t.db
      .insert(users)
      .values({
        name: "Ada Admin",
        email: "ada@core.example",
        role: "super_admin",
      })
      .returning({ id: users.id });
    admin = { id: adminRow.id, role: "super_admin" };

    const [strangerRow] = await t.db
      .insert(users)
      .values({ name: "Sam Stranger", email: "sam@core.example" })
      .returning({ id: users.id });
    stranger = { id: strangerRow.id, role: "user" };
  });

  afterAll(async () => {
    await t.cleanup();
  });

  describe("updateOwnName", () => {
    it("lets someone rename themselves", async () => {
      await updateOwnName(t.db, pat, pat.id, "Patricia Member");

      const [row] = await t.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, pat.id));
      expect(row.name).toBe("Patricia Member");
    });

    it("trims surrounding whitespace", async () => {
      await updateOwnName(t.db, pat, pat.id, "   Pat Member   ");

      const [row] = await t.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, pat.id));
      expect(row.name).toBe("Pat Member");
    });

    it("rejects an empty name", async () => {
      await expect(updateOwnName(t.db, pat, pat.id, "   ")).rejects.toThrow(
        /name is required/i,
      );
    });

    it("lets a super admin rename anyone", async () => {
      await updateOwnName(t.db, admin, pat.id, "Renamed By Admin");

      const [row] = await t.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, pat.id));
      expect(row.name).toBe("Renamed By Admin");

      await updateOwnName(t.db, pat, pat.id, "Pat Member");
    });

    it("refuses to let one member rename another", async () => {
      await expect(
        updateOwnName(t.db, stranger, pat.id, "Hacked Name"),
      ).rejects.toThrow(/not permitted/i);
    });
  });

  describe("changeOwnPassword", () => {
    beforeEach(async () => {
      await t.db
        .update(users)
        .set({ passwordHash: await hashPassword(PASSWORD) })
        .where(eq(users.id, pat.id));
    });

    it("replaces the password when the current one is given", async () => {
      await changeOwnPassword(t.db, pat, {
        currentPassword: PASSWORD,
        newPassword: "a whole new password",
      });

      const result = await authenticateWithPassword(t.db, {
        email: "pat@core.example",
        password: "a whole new password",
      });
      expect(result?.id).toBe(pat.id);
    });

    it("refuses when the current password is wrong", async () => {
      await expect(
        changeOwnPassword(t.db, pat, {
          currentPassword: "not the current one",
          newPassword: "a whole new password",
        }),
      ).rejects.toThrow(/current password/i);
    });

    it("lets an account with no password set one without a current password", async () => {
      await t.db
        .update(users)
        .set({ passwordHash: null })
        .where(eq(users.id, stranger.id));

      await changeOwnPassword(t.db, stranger, {
        currentPassword: "",
        newPassword: "first password ever",
      });

      const result = await authenticateWithPassword(t.db, {
        email: "sam@core.example",
        password: "first password ever",
      });
      expect(result?.id).toBe(stranger.id);
    });
  });

  describe("saveAvatar", () => {
    it("stores the bytes and points users.image at the avatar route", async () => {
      await saveAvatar(t.db, pat, {
        mime: "image/webp",
        bytes: webpBytes(),
      });

      const [avatar] = await t.db
        .select()
        .from(userAvatars)
        .where(eq(userAvatars.userId, pat.id));
      expect(avatar.bytes.length).toBe(64);

      const [row] = await t.db
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, pat.id));
      expect(row.image).toContain(`/api/avatar/${pat.id}`);
    });

    it("busts the cached URL when the avatar changes", async () => {
      await saveAvatar(t.db, pat, { mime: "image/webp", bytes: webpBytes() });
      const [first] = await t.db
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, pat.id));

      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveAvatar(t.db, pat, {
        mime: "image/webp",
        bytes: webpBytes(128),
      });
      const [second] = await t.db
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, pat.id));

      expect(second.image).not.toBe(first.image);
    });

    it("replaces an existing avatar rather than failing", async () => {
      await saveAvatar(t.db, pat, { mime: "image/webp", bytes: webpBytes() });
      await saveAvatar(t.db, pat, {
        mime: "image/webp",
        bytes: webpBytes(128),
      });

      const rows = await t.db
        .select()
        .from(userAvatars)
        .where(eq(userAvatars.userId, pat.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].bytes.length).toBe(128);
    });

    it("rejects an upload above the size cap", async () => {
      await expect(
        saveAvatar(t.db, pat, {
          mime: "image/webp",
          bytes: webpBytes(MAX_AVATAR_BYTES + 1),
        }),
      ).rejects.toThrow(/too large/i);
    });

    it("rejects bytes that do not match the declared type", async () => {
      await expect(
        saveAvatar(t.db, pat, {
          mime: "image/webp",
          bytes: Buffer.from("<?php system($_GET[0]); ?>"),
        }),
      ).rejects.toThrow(/not a valid/i);
    });

    it("rejects a media type that is not an accepted image", async () => {
      await expect(
        saveAvatar(t.db, pat, {
          mime: "image/svg+xml" as "image/webp",
          bytes: Buffer.from("<svg onload=alert(1)>"),
        }),
      ).rejects.toThrow(/not a valid/i);
    });
  });

  describe("removeAvatar", () => {
    it("deletes the bytes and clears the image URL", async () => {
      await saveAvatar(t.db, pat, { mime: "image/webp", bytes: webpBytes() });
      await removeAvatar(t.db, pat);

      const rows = await t.db
        .select()
        .from(userAvatars)
        .where(eq(userAvatars.userId, pat.id));
      expect(rows).toHaveLength(0);

      const [row] = await t.db
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, pat.id));
      expect(row.image).toBeNull();
    });

    it("is harmless when there is no avatar to remove", async () => {
      await removeAvatar(t.db, pat);
      await expect(removeAvatar(t.db, pat)).resolves.toBeUndefined();
    });
  });
});
