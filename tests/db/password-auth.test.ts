import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import {
  MAX_FAILED_ATTEMPTS,
  MIN_PASSWORD_LENGTH,
  authenticateWithPassword,
  setPassword,
} from "@/db/mutations/password";
import { hashPassword } from "@/lib/auth/password";
import { makeTestDb, type TestDb } from "../helpers/db";

const PASSWORD = "a decent long password";

describe("authenticateWithPassword", () => {
  let t: TestDb;
  let userId: string;

  beforeAll(async () => {
    t = await makeTestDb();
    const [row] = await t.db
      .insert(users)
      .values({
        name: "Pat Member",
        email: "pat@core.example",
        passwordHash: await hashPassword(PASSWORD),
      })
      .returning({ id: users.id });
    userId = row.id;

    await t.db
      .insert(users)
      .values({ name: "Goog Only", email: "goog@core.example" });
  });

  afterAll(async () => {
    await t.cleanup();
  });

  beforeEach(async () => {
    await t.db
      .update(users)
      .set({ passwordFailedAttempts: 0, passwordLockedUntil: null })
      .where(eq(users.id, userId));
  });

  it("returns the user for a correct password", async () => {
    const result = await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: PASSWORD,
    });

    expect(result?.id).toBe(userId);
    expect(result?.name).toBe("Pat Member");
  });

  it("carries the role, which the session is built from", async () => {
    const result = await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: PASSWORD,
    });

    expect(result?.role).toBe("user");
  });

  it("normalises the email the way the roster stores it", async () => {
    const result = await authenticateWithPassword(t.db, {
      email: "  PAT@Core.Example  ",
      password: PASSWORD,
    });

    expect(result?.id).toBe(userId);
  });

  it("returns null for the wrong password", async () => {
    const result = await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: "not the password",
    });

    expect(result).toBeNull();
  });

  it("returns null for an email that is not on the roster", async () => {
    const result = await authenticateWithPassword(t.db, {
      email: "stranger@core.example",
      password: PASSWORD,
    });

    expect(result).toBeNull();
  });

  it("returns null for an account that has no password set", async () => {
    const result = await authenticateWithPassword(t.db, {
      email: "goog@core.example",
      password: PASSWORD,
    });

    expect(result).toBeNull();
  });

  it("counts consecutive failures on the account", async () => {
    await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: "wrong",
    });
    await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: "wrong",
    });

    const [row] = await t.db
      .select({ attempts: users.passwordFailedAttempts })
      .from(users)
      .where(eq(users.id, userId));
    expect(row.attempts).toBe(2);
  });

  it("clears the failure count after a correct password", async () => {
    await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: "wrong",
    });
    await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: PASSWORD,
    });

    const [row] = await t.db
      .select({ attempts: users.passwordFailedAttempts })
      .from(users)
      .where(eq(users.id, userId));
    expect(row.attempts).toBe(0);
  });

  it("locks the account after too many failures", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await authenticateWithPassword(t.db, {
        email: "pat@core.example",
        password: "wrong",
      });
    }

    const [row] = await t.db
      .select({ lockedUntil: users.passwordLockedUntil })
      .from(users)
      .where(eq(users.id, userId));
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses the correct password while the account is locked", async () => {
    await t.db
      .update(users)
      .set({ passwordLockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(users.id, userId));

    const result = await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: PASSWORD,
    });

    expect(result).toBeNull();
  });

  it("accepts the correct password once the lock has expired", async () => {
    await t.db
      .update(users)
      .set({
        passwordFailedAttempts: MAX_FAILED_ATTEMPTS,
        passwordLockedUntil: new Date(Date.now() - 60_000),
      })
      .where(eq(users.id, userId));

    const result = await authenticateWithPassword(t.db, {
      email: "pat@core.example",
      password: PASSWORD,
    });

    expect(result?.id).toBe(userId);
  });
});

describe("setPassword", () => {
  let t: TestDb;
  let userId: string;

  beforeAll(async () => {
    t = await makeTestDb();
    const [row] = await t.db
      .insert(users)
      .values({ name: "Sam Member", email: "sam@core.example" })
      .returning({ id: users.id });
    userId = row.id;
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it("gives an account with no password one it can sign in with", async () => {
    await setPassword(t.db, userId, "brand new password");

    const result = await authenticateWithPassword(t.db, {
      email: "sam@core.example",
      password: "brand new password",
    });
    expect(result?.id).toBe(userId);
  });

  it("retires the previous password", async () => {
    await setPassword(t.db, userId, "the first password");
    await setPassword(t.db, userId, "the second password");

    const result = await authenticateWithPassword(t.db, {
      email: "sam@core.example",
      password: "the first password",
    });
    expect(result).toBeNull();
  });

  it("rejects a password below the minimum length", async () => {
    await expect(
      setPassword(t.db, userId, "x".repeat(MIN_PASSWORD_LENGTH - 1)),
    ).rejects.toThrow(/at least/i);
  });

  it("lifts a lockout, since setting a password proves ownership", async () => {
    await t.db
      .update(users)
      .set({
        passwordFailedAttempts: MAX_FAILED_ATTEMPTS,
        passwordLockedUntil: new Date(Date.now() + 60_000),
      })
      .where(eq(users.id, userId));

    await setPassword(t.db, userId, "a fresh start password");

    const result = await authenticateWithPassword(t.db, {
      email: "sam@core.example",
      password: "a fresh start password",
    });
    expect(result?.id).toBe(userId);
  });

  it("refuses to set a password on an account that does not exist", async () => {
    await expect(
      setPassword(t.db, "no-such-user", "a perfectly fine password"),
    ).rejects.toThrow(/not found/i);
  });
});
