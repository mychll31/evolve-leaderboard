import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { MIN_PASSWORD_LENGTH, setPassword } from "@/db/mutations/password";
import {
  consumePasswordSetupToken,
  peekPasswordSetupToken,
} from "@/db/mutations/password-tokens";
import { ConflictError } from "@/db/mutations/guards";

/**
 * The page a one-time set-password link lands on.
 *
 * The token is only checked here, not spent — spending it on a page view would
 * invalidate the form being drawn. The submit action spends it, which is also
 * what makes the link single-use.
 */
export default async function SetPasswordPage(props: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await props.searchParams;
  const userId = token ? await peekPasswordSetupToken(getDb(), token) : null;

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
          <div className="font-display mt-7 text-[54px] leading-[0.95] font-extrabold tracking-tight text-white">
            Set your
            <br />
            password
          </div>
        </div>

        <div className="border-shell-line rounded-[22px] border bg-white/5 p-7 backdrop-blur">
          {!userId ? (
            <>
              <div
                role="alert"
                className="rounded-2xl border border-[#7F3A2A] bg-[#2A1712] px-4 py-3 text-[13px] leading-relaxed font-medium text-[#FFC7AC]"
              >
                This link has expired or has already been used. Ask your Leader
                or an admin for a new one.
              </div>
              <Link
                href="/signin"
                className="mt-5 block w-full rounded-xl bg-white px-5 py-3.5 text-center text-[14px] font-extrabold text-[#1F2937] transition hover:bg-[#F1F5F8]"
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl border border-[#7F3A2A] bg-[#2A1712] px-4 py-3 text-[13px] leading-relaxed font-medium text-[#FFC7AC]"
                >
                  {error}
                </div>
              )}

              <form
                action={async (formData: FormData) => {
                  "use server";

                  const submitted = String(formData.get("token") ?? "");
                  const password = String(formData.get("password") ?? "");
                  const confirm = String(formData.get("confirm") ?? "");

                  const fail = (message: string) =>
                    redirect(
                      `/set-password?token=${encodeURIComponent(submitted)}&error=${encodeURIComponent(message)}`,
                    );

                  if (password !== confirm) fail("Those passwords do not match");

                  // Spent here, so a link works exactly once even if the form
                  // is submitted twice.
                  const db = getDb();
                  const owner = await consumePasswordSetupToken(db, submitted);
                  if (!owner) redirect("/set-password");

                  try {
                    await setPassword(db, owner, password);
                  } catch (cause) {
                    if (cause instanceof ConflictError) fail(cause.message);
                    throw cause;
                  }

                  redirect("/signin?set=1");
                }}
                className="flex flex-col gap-3"
              >
                <input type="hidden" name="token" value={token} />

                <label className="block">
                  <span className="text-shell-ink-2 mb-1.5 block text-[12px] font-extrabold tracking-[0.1em] uppercase">
                    New password
                  </span>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    className="border-shell-line w-full rounded-xl border bg-black/25 px-4 py-3 text-[14px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-white/40"
                    placeholder="••••••••••"
                  />
                </label>

                <label className="block">
                  <span className="text-shell-ink-2 mb-1.5 block text-[12px] font-extrabold tracking-[0.1em] uppercase">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    name="confirm"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    className="border-shell-line w-full rounded-xl border bg-black/25 px-4 py-3 text-[14px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-white/40"
                    placeholder="••••••••••"
                  />
                </label>

                <button
                  type="submit"
                  className="bg-accent mt-1 w-full cursor-pointer rounded-xl px-5 py-3.5 text-[14px] font-extrabold text-white transition hover:brightness-110"
                >
                  Set password
                </button>
              </form>

              <p className="text-shell-ink-2 mt-5 text-center text-[12px] leading-relaxed">
                At least {MIN_PASSWORD_LENGTH} characters. A long phrase you will
                remember beats a short one with symbols in it.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
