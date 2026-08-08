import Image from "next/image";
import Link from "next/link";

/**
 * Sign-in error page.
 *
 * Auth.js ships a bare unstyled fallback at `/api/auth/error`; without
 * `pages.error` pointed here, a rejected sign-in lands on a page that says
 * only "Error" and gives the person nothing to act on.
 *
 * `AccessDenied` is by far the most likely outcome for a real human, because
 * Leaderboard is invite-only and there is no public signup — so it gets a full
 * explanation rather than an apology.
 */

type ErrorCopy = {
  emoji: string;
  heading: string;
  body: string;
  detail?: string;
  audience: "member" | "admin";
};

const ERRORS: Record<string, ErrorCopy> = {
  AccessDenied: {
    emoji: "🔒",
    heading: "YOU'RE NOT ON THE ROSTER YET",
    body: "Leaderboard is invite-only. Your Google account signed in fine, but that email address hasn't been added to the season yet — so there's nothing here for it to open.",
    detail:
      "Ask your Leader or a Leaderboard admin to add your email address. Once they have, come back and sign in with the same Google account.",
    audience: "member",
  },
  Configuration: {
    emoji: "🛠",
    heading: "SIGN-IN ISN'T CONFIGURED",
    body: "The server is missing its authentication settings, so nobody can sign in right now. This isn't something you can fix from here.",
    detail:
      "If you're an administrator: check AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, then run npm run auth:check.",
    audience: "admin",
  },
  Verification: {
    emoji: "⌛",
    heading: "THAT LINK HAS EXPIRED",
    body: "The sign-in link you used is no longer valid — it may already have been used, or simply timed out.",
    detail: "Start again from the sign-in page.",
    audience: "member",
  },
  OAuthAccountNotLinked: {
    emoji: "🔗",
    heading: "THAT EMAIL IS ALREADY IN USE",
    body: "This email address is already registered against a different sign-in method.",
    detail:
      "Sign in the way you did the first time, or ask an admin to sort the account out.",
    audience: "member",
  },
  Default: {
    emoji: "🏀",
    heading: "SOMETHING WENT WRONG",
    body: "We couldn't complete that sign-in. It's usually temporary.",
    detail: "Try again, and tell an admin if it keeps happening.",
    audience: "member",
  },
};

export default async function AuthErrorPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await props.searchParams;

  // Auth.js has been seen to append the callback path to the code, e.g.
  // "AccessDenied/signin" — take the leading segment so the copy still matches.
  const code = (error ?? "Default").split("/")[0];
  const copy = ERRORS[code] ?? ERRORS.Default;

  return (
    <main className="bg-shell relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(760px 460px at 50% -10%, rgba(249,115,22,.26), transparent 70%), radial-gradient(560px 380px at 90% 110%, rgba(18,181,203,.22), transparent 72%)",
        }}
      />

      <div className="relative w-full max-w-[480px]">
        <div className="mb-7 text-center">
          <Image
            src="/evolve-logo.png"
            alt="E-VOLVE"
            width={1686}
            height={406}
            priority
            className="mx-auto h-7 w-auto"
          />
        </div>

        <div className="border-shell-line rounded-[22px] border bg-white/5 p-7 backdrop-blur sm:p-8">
          <div className="text-[40px] leading-none">{copy.emoji}</div>

          <h1 className="font-display mt-4 text-[34px] leading-[1.05] font-extrabold text-white sm:text-[40px]">
            {copy.heading}
          </h1>

          <p className="text-shell-ink mt-4 text-[14px] leading-relaxed font-medium">
            {copy.body}
          </p>

          {copy.detail && (
            <div className="border-shell-line mt-5 rounded-2xl border bg-black/25 px-4 py-3.5">
              <p className="text-[13px] leading-relaxed font-semibold text-[#C7D3DE]">
                {copy.detail}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <Link
              href="/signin"
              className="bg-primary hover:bg-primary-dark flex-1 rounded-xl px-5 py-3.5 text-center text-[13px] font-extrabold tracking-[0.06em] text-white uppercase transition-colors"
            >
              Try again
            </Link>
            {copy.audience === "member" && (
              <a
                href="mailto:?subject=Leaderboard%20access&body=Hi%2C%20please%20add%20my%20email%20address%20to%20Leaderboard%20so%20I%20can%20sign%20in."
                className="border-shell-line text-shell-ink flex-1 rounded-xl border px-5 py-3.5 text-center text-[13px] font-extrabold tracking-[0.06em] uppercase transition-colors hover:bg-white/5"
              >
                Email my Leader
              </a>
            )}
          </div>

          <p className="text-shell-ink-2 mt-5 text-center text-[11.5px] font-semibold">
            Error code: {code}
          </p>
        </div>
      </div>
    </main>
  );
}
