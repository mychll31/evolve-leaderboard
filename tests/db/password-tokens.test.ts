import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users, verificationTokens } from "@/db/schema";
import {
  consumePasswordSetupToken,
  mintPasswordSetupToken,
  peekPasswordSetupToken,
} from "@/db/mutations/password-tokens";
import { makeTestDb, type TestDb } from "../helpers/db";

describe("set-password tokens", () => {
  let t: TestDb;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    t = await makeTestDb();
    const [row] = await t.db
      .insert(users)
      .values({ name: "Pat Member", email: "pat@core.example" })
      .returning({ id: users.id });
    userId = row.id;

    const [other] = await t.db
      .insert(users)
      .values({ name: "Other Member", email: "other@core.example" })
      .returning({ id: users.id });
    otherUserId = other.id;
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it("mints a token that resolves back to the user", async () => {
    const token = await mintPasswordSetupToken(t.db, userId);
    expect(await consumePasswordSetupToken(t.db, token)).toBe(userId);
  });

  it("mints an unguessable token", async () => {
    const token = await mintPasswordSetupToken(t.db, userId);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).not.toContain(userId);
  });

  it("only lets a token be used once", async () => {
    const token = await mintPasswordSetupToken(t.db, userId);
    await consumePasswordSetupToken(t.db, token);

    expect(await consumePasswordSetupToken(t.db, token)).toBeNull();
  });

  it("rejects a token that was never minted", async () => {
    expect(await consumePasswordSetupToken(t.db, "made-up-token")).toBeNull();
  });

  it("rejects an expired token and clears it away", async () => {
    const token = await mintPasswordSetupToken(t.db, userId);
    await t.db
      .update(verificationTokens)
      .set({ expires: new Date(Date.now() - 1000) })
      .where(eq(verificationTokens.token, token));

    expect(await consumePasswordSetupToken(t.db, token)).toBeNull();

    const left = await t.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token));
    expect(left).toHaveLength(0);
  });

  it("invalidates the previous token when a new one is minted", async () => {
    const first = await mintPasswordSetupToken(t.db, userId);
    const second = await mintPasswordSetupToken(t.db, userId);

    expect(await consumePasswordSetupToken(t.db, first)).toBeNull();
    expect(await consumePasswordSetupToken(t.db, second)).toBe(userId);
  });

  it("does not disturb another user's outstanding token", async () => {
    const theirs = await mintPasswordSetupToken(t.db, otherUserId);
    await mintPasswordSetupToken(t.db, userId);

    expect(await consumePasswordSetupToken(t.db, theirs)).toBe(otherUserId);
  });

  it("refuses to mint for an account that does not exist", async () => {
    await expect(mintPasswordSetupToken(t.db, "no-such-user")).rejects.toThrow(
      /not found/i,
    );
  });

  // The set-password page has to know a link is good before it renders a form,
  // but spending the token on a page view would break the form it just drew.
  it("peeks at a token without spending it", async () => {
    const token = await mintPasswordSetupToken(t.db, userId);

    expect(await peekPasswordSetupToken(t.db, token)).toBe(userId);
    expect(await peekPasswordSetupToken(t.db, token)).toBe(userId);
    expect(await consumePasswordSetupToken(t.db, token)).toBe(userId);
  });

  it("peeks null at an expired token", async () => {
    const token = await mintPasswordSetupToken(t.db, userId);
    await t.db
      .update(verificationTokens)
      .set({ expires: new Date(Date.now() - 1000) })
      .where(eq(verificationTokens.token, token));

    expect(await peekPasswordSetupToken(t.db, token)).toBeNull();
  });

  it("peeks null at a token that was never minted", async () => {
    expect(await peekPasswordSetupToken(t.db, "made-up-token")).toBeNull();
  });
});
