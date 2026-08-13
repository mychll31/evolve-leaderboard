import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  test("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  test("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse batteryX", hash)).toBe(false);
  });

  test("produces a different hash for the same password each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
  });

  test("rejects a hash whose stored digest has been tampered with", async () => {
    const hash = await hashPassword("correct horse battery");
    const parts = hash.split("$");
    parts[5] = Buffer.from("not the real digest").toString("base64url");
    expect(await verifyPassword("correct horse battery", parts.join("$"))).toBe(
      false,
    );
  });

  test("rejects a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  test("rejects an unknown algorithm prefix", async () => {
    const hash = await hashPassword("correct horse battery");
    const forged = `md5${hash.slice("scrypt".length)}`;
    expect(await verifyPassword("correct horse battery", forged)).toBe(false);
  });
});
