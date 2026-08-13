import { randomUUID } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getDb } from "@/db/client";
import { authenticateWithPassword } from "@/db/mutations/password";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

/**
 * Auth.js refuses to run without a secret, and logs `MissingSecret` on every
 * single request rather than failing once — which is easy to miss behind a
 * working dev bypass, and would mean sign-in was broken in production.
 *
 * In development we supply a fixed placeholder so a fresh clone works and the
 * log stays readable. In production there is deliberately no fallback: a
 * missing secret must be loud, because a guessable one would let anyone forge
 * a session cookie.
 */
function resolveSecret(): string | undefined {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") return undefined;
  return "core-plus-development-secret-not-for-production";
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();
  const adapter = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });

  return {
    secret: resolveSecret(),
    adapter,
    // Stated rather than inferred, because the `jwt.encode` override below is
    // only correct while this is "database".
    session: { strategy: "database" },
    /**
     * Not a JWT, despite the name.
     *
     * Auth.js's credentials path issues a JWT session cookie unconditionally —
     * it calls `jwt.encode` outside the `if (useJwtSession)` guard that wraps
     * the OAuth and email paths (@auth/core/lib/actions/callback/index.js).
     * With database sessions that cookie resolves to nothing, so a password
     * sign-in would appear to succeed and leave the person signed out.
     *
     * Overriding `encode` turns that step into "create a real session row and
     * return its token". Under `strategy: "database"` this is the only code
     * path that reaches it, so Google sign-in is untouched, while Auth.js keeps
     * ownership of the cookie name, the `__Secure-` prefix, expiry and CSRF.
     *
     * If a future release starts calling `encode` from the database path too,
     * the symptom is a broken Google sign-in rather than a silent weakening.
     */
    jwt: {
      async encode({ token, maxAge }) {
        const userId = token?.sub;
        if (!userId) throw new Error("Cannot create a session without a user");

        const sessionToken = randomUUID();
        await adapter.createSession?.({
          sessionToken,
          userId,
          expires: new Date(Date.now() + (maxAge ?? 0) * 1000),
        });

        return sessionToken;
      },
    },
    providers: [
      Credentials({
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        /**
         * Returns null for every kind of failure — unknown address, wrong
         * password, locked account. Auth.js turns that into one
         * `CredentialsSignin` error, which is exactly the granularity the
         * sign-in page should show.
         */
        async authorize(credentials) {
          const email = credentials?.email;
          const password = credentials?.password;
          if (typeof email !== "string" || typeof password !== "string") {
            return null;
          }

          return authenticateWithPassword(db, { email, password });
        },
      }),
      Google({
        // Members are pre-created by an admin with only an email address, then
        // link their Google account on first sign-in. Without this, Auth.js
        // refuses with OAuthAccountNotLinked and nobody can ever get in.
        //
        // The usual risk here is a provider that does not verify email
        // ownership, letting someone claim an existing account. Google does
        // verify, and the signIn callback below rejects any profile whose
        // email_verified is false, so the linking is safe.
        allowDangerousEmailAccountLinking: true,
      }),
    ],
    // Without `error`, a rejected sign-in lands on Auth.js's built-in
    // /api/auth/error, which renders an unstyled page saying only "Error".
    // AccessDenied is the expected outcome for anyone not yet on the roster,
    // so it needs to explain itself.
    pages: { signIn: "/signin", error: "/auth/error" },
    callbacks: {
      /**
       * The allowlist. There is no public signup: an address with no
       * pre-created `users` row is refused outright.
       */
      async signIn({ profile, account }) {
        // `authorize()` has already checked the roster and the password; there
        // is nothing left for this callback to add.
        if (account?.provider === "credentials") return true;

        if (account?.provider !== "google") return false;
        if (!profile?.email || profile.email_verified !== true) return false;

        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, profile.email))
          .limit(1);

        return Boolean(existing);
      },

      /**
       * Database sessions mean `user` is the live row, so a role change takes
       * effect on the next request rather than whenever a JWT would expire.
       */
      session({ session, user }) {
        session.user.id = user.id;
        session.user.role = user.role;
        return session;
      },
    },
  };
});
