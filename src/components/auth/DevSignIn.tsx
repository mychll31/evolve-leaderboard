import { signInAsAction } from "@/app/actions/auth";
import type { DevAccount } from "@/lib/auth/dev";

const ROLE_META: Record<
  DevAccount["label"],
  { emoji: string; blurb: string }
> = {
  "Super Admin": {
    emoji: "🛠",
    blurb: "Everything, plus the admin console",
  },
  Coach: {
    emoji: "📋",
    blurb: "Their own team's desk and score entry",
  },
  Member: {
    emoji: "🏀",
    blurb: "Read-only, plus their own check-in",
  },
};

/**
 * Development-only account switcher.
 *
 * Rendered only when `hasDevelopmentAuthBypass()` is true, which is false in
 * any production build. Deliberately styled as scaffolding rather than as part
 * of the product, so it can never be mistaken for a real sign-in route.
 */
export function DevSignIn({
  samples,
  others,
}: {
  samples: DevAccount[];
  others: DevAccount[];
}) {
  if (samples.length === 0 && others.length === 0) {
    return (
      <div className="border-shell-line mt-5 rounded-[22px] border border-dashed bg-black/20 p-6">
        <p className="text-shell-ink text-[13px] leading-relaxed font-semibold">
          Development sign-in is on, but there are no accounts in the database
          yet. Run <code className="text-white">npm run db:seed</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="border-shell-line mt-5 rounded-[22px] border border-dashed bg-black/20 p-6">
      <div className="flex items-center gap-2">
        <span className="text-[13px]">🔧</span>
        <h2 className="text-[11px] font-extrabold tracking-[0.18em] text-[#F5D9A8] uppercase">
          Development sign-in
        </h2>
      </div>
      <p className="text-shell-ink-2 mt-1.5 text-[11.5px] leading-relaxed font-medium">
        Skips Google entirely. Never available in a production build.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {samples.map((account) => {
          const meta = ROLE_META[account.label];
          return (
            <form key={account.id} action={signInAsAction.bind(null, account.id)}>
              <button
                type="submit"
                className="border-shell-line flex w-full cursor-pointer items-center gap-3.5 rounded-xl border bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
              >
                <span className="text-[20px] leading-none">{meta.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-extrabold text-white">
                    {account.label}
                    <span className="text-shell-ink-2 font-semibold">
                      {" "}
                      · {account.name}
                    </span>
                  </span>
                  <span className="text-shell-ink-2 block truncate text-[11px] font-medium">
                    {meta.blurb}
                    {account.teamName ? ` · ${account.teamName}` : ""}
                  </span>
                </span>
                <span className="text-shell-ink-2 shrink-0 text-[16px]">›</span>
              </button>
            </form>
          );
        })}
      </div>

      {others.length > 0 && (
        <details className="mt-3.5">
          <summary className="text-shell-ink-2 cursor-pointer text-[11.5px] font-bold">
            Sign in as someone else ({others.length})
          </summary>
          <div className="mt-2.5 flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
            {others.map((account) => (
              <form
                key={account.id}
                action={signInAsAction.bind(null, account.id)}
              >
                <button
                  type="submit"
                  className="text-shell-ink flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[12px] font-semibold transition-colors hover:bg-white/5"
                >
                  <span className="truncate">
                    {account.name}
                    <span className="text-shell-ink-2">
                      {account.teamName ? ` · ${account.teamName}` : ""}
                    </span>
                  </span>
                  <span className="text-shell-ink-2 shrink-0 text-[10px] font-extrabold tracking-[0.1em] uppercase">
                    {account.label}
                  </span>
                </button>
              </form>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
