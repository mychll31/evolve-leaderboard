import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/db/client";
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

  return {
    secret: resolveSecret(),
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
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
    pages: { signIn: "/signin" },
    callbacks: {
      /**
       * The allowlist. There is no public signup: an address with no
       * pre-created `users` row is refused outright.
       */
      async signIn({ profile, account }) {
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
