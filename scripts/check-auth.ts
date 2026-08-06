import "dotenv/config";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";

/**
 * Preflight for the auth setup.
 *
 * Every one of these failures is silent or cryptic at runtime — a missing
 * secret only shows up as a log line on each request, and an empty roster
 * looks exactly like a working OAuth flow that rejects you. Checking them
 * explicitly is much cheaper than diagnosing them from a redirect loop.
 */

const BASE_URL = process.argv[2] ?? "http://localhost:3000";

type Check = { ok: boolean; label: string; detail: string };

const checks: Check[] = [];

function check(ok: boolean, label: string, detail: string) {
  checks.push({ ok, label, detail });
}

// --- Secret --------------------------------------------------------------
const secret = process.env.AUTH_SECRET;
check(
  Boolean(secret && secret.length >= 32),
  "AUTH_SECRET",
  secret
    ? secret.length >= 32
      ? `set (${secret.length} chars)`
      : `too short (${secret.length} chars) — generate a new one with \`npx auth secret\``
    : "missing — development falls back to a placeholder, but production will refuse to start",
);

// --- Google credentials --------------------------------------------------
const clientId = process.env.AUTH_GOOGLE_ID;
const clientSecret = process.env.AUTH_GOOGLE_SECRET;

check(
  Boolean(clientId),
  "AUTH_GOOGLE_ID",
  clientId
    ? clientId.endsWith(".apps.googleusercontent.com")
      ? "set and well-formed"
      : "set, but does not end in .apps.googleusercontent.com — is this the client ID?"
    : "missing — sign-in will fail",
);

check(
  Boolean(clientSecret),
  "AUTH_GOOGLE_SECRET",
  clientSecret
    ? clientSecret.startsWith("GOCSPX-")
      ? "set and well-formed"
      : "set, but does not start with GOCSPX- — is this the client secret?"
    : "missing — sign-in will fail",
);

// --- Database ------------------------------------------------------------
const dbUrl = process.env.TURSO_DATABASE_URL;
check(Boolean(dbUrl), "TURSO_DATABASE_URL", dbUrl ?? "missing");

// --- Roster --------------------------------------------------------------
// Leaderboard is invite-only, so an empty users table means OAuth succeeds and then
// every sign-in is refused. That failure is indistinguishable from a
// misconfigured client unless you check for it directly.
let rosterDetail = "could not read the database";
let rosterOk = false;
try {
  const rows = await getDb().select({ email: users.email }).from(users);
  rosterOk = rows.length > 0;
  rosterDetail = rosterOk
    ? `${rows.length} authorised address${rows.length === 1 ? "" : "es"}`
    : "empty — nobody can sign in until an admin adds people. Run `npm run db:seed`.";
} catch (error) {
  rosterDetail = `could not read the database: ${
    error instanceof Error ? error.message : String(error)
  }`;
}
check(rosterOk, "Authorised roster", rosterDetail);

// --- Dev bypass ----------------------------------------------------------
const devEmail = process.env.AUTH_DEV_EMAIL;
const devPicker = process.env.AUTH_DEV_LOGIN === "true";
if (devEmail || devPicker) {
  console.log(
    `\n\x1b[33m⚠  Development sign-in is enabled${devPicker ? " (AUTH_DEV_LOGIN)" : ` (AUTH_DEV_EMAIL=${devEmail})`}.\x1b[0m\n` +
      "   Real Google sign-in is bypassed while this is set, so it will mask\n" +
      "   any credential problem. Clear it to test the actual sign-in path.\n",
  );
}

// --- Report --------------------------------------------------------------
console.log("Leaderboard auth preflight\n");
for (const c of checks) {
  const mark = c.ok ? "[32m✓[0m" : "[31m✗[0m";
  console.log(`  ${mark} ${c.label.padEnd(20)} ${c.detail}`);
}

console.log("\nRegister this exact redirect URI in the Google Cloud console:\n");
console.log(`  [36m${BASE_URL}/api/auth/callback/google[0m\n`);
console.log("  Pass a different origin to print its URI, e.g.");
console.log("    npm run auth:check -- https://core-plus.vercel.app\n");

const failures = checks.filter((c) => !c.ok);
if (failures.length > 0) {
  console.log(
    `[31m${failures.length} problem${failures.length === 1 ? "" : "s"} to fix before sign-in will work.[0m`,
  );
  process.exit(1);
}
console.log("[32mAuth is configured.[0m");
