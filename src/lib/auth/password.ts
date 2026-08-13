import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing on `node:crypto`'s scrypt.
 *
 * bcrypt and argon2 are both better known, and both would be the only native
 * dependency in this tree. scrypt is memory-hard, in the standard library, and
 * strong enough at these parameters.
 *
 * The parameters are encoded into the stored string rather than read from a
 * constant at verification time, so they can be raised later without
 * invalidating every existing password.
 */
const ALGORITHM = "scrypt";
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Encoded as `scrypt$N$r$p$salt$digest`, both binary parts base64url. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const digest = await scryptAsync(plain, salt, KEY_LENGTH);

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

/**
 * Returns false rather than throwing for anything unparseable. A corrupt or
 * hand-edited hash is a failed sign-in, not a 500 — and the caller must not be
 * able to tell the two apart.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;

  const [algorithm, , , , saltPart, digestPart] = parts;
  if (algorithm !== ALGORITHM) return false;

  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(digestPart, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scryptAsync(plain, salt, expected.length);

  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
