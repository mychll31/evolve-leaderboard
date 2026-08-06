import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/guards";

/**
 * Auth.js reports allowlist rejections as `AccessDenied`. Because there is no
 * public signup, that is the single most likely outcome for a stranger, so it
 * gets a real explanation rather than a generic failure.
 */
const ERRORS: Record<string, string> = {
  AccessDenied:
    "That Google account is not on the Core+ roster. Ask your coach or an admin to add your email, then try again.",
  Configuration:
    "Sign-in is not configured correctly. Please contact an administrator.",
  Verification: "That sign-in link has expired. Please try again.",
};

export default async function SignInPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect("/dashboard");

  const { error } = await props.searchParams;
  const message = error
    ? (ERRORS[error] ?? "Something went wrong signing in. Please try again.")
    : null;

  // Without credentials the button bounces off Google with an opaque error.
  // Say so plainly instead — in development only, since in production this
  // would be leaking configuration state to anyone who loads the page.
  const misconfigured =
    process.env.NODE_ENV !== "production" &&
    !(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <main className="bg-shell relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(760px 460px at 50% -10%, rgba(18,181,203,.34), transparent 70%), radial-gradient(560px 380px at 90% 110%, rgba(249,115,22,.26), transparent 72%)",
        }}
      />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <Image
            src="/evolve-logo.png"
            alt="E-VOLVE"
            width={1686}
            height={406}
            priority
            className="mx-auto h-8 w-auto"
          />
          <div className="font-display mt-7 text-[76px] leading-[0.9] font-extrabold tracking-tight text-white">
            Leaderboard
          </div>
          <p className="text-shell-ink mt-3 text-[13px] font-semibold tracking-[0.22em] uppercase">
            Season 1 · Accountability
          </p>
        </div>

        <div className="border-shell-line rounded-[22px] border bg-white/5 p-7 backdrop-blur">
          {message && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-[#7F3A2A] bg-[#2A1712] px-4 py-3 text-[13px] leading-relaxed font-medium text-[#FFC7AC]"
            >
              {message}
            </div>
          )}

          {misconfigured && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-[#7A5A2A] bg-[#2A2112] px-4 py-3 text-[13px] leading-relaxed font-medium text-[#F5D9A8]"
            >
              <strong className="font-extrabold">Google sign-in is not configured.</strong>{" "}
              Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code>{" "}
              in <code>.env</code>, then run{" "}
              <code>npm run auth:check</code>. This notice appears in
              development only.
            </div>
          )}

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              disabled={misconfigured}
              className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-[14px] font-extrabold text-[#1F2937] transition hover:bg-[#F1F5F8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
                />
              </svg>
              Sign in with Google
            </button>
          </form>

          <p className="text-shell-ink-2 mt-5 text-center text-[12px] leading-relaxed">
            Core+ is invite-only. Your admin adds your email before you can
            sign in.
          </p>
        </div>
      </div>
    </main>
  );
}
