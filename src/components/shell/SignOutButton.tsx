import clsx from "clsx";
import { signOutAction } from "@/app/actions/auth";

/**
 * Shared so the control exists in both shells. The sidebar is `lg:` and above
 * only, so a sign-out that lived solely there left phone users with no way out
 * of the app at all.
 */
export function SignOutButton({
  variant = "sidebar",
  className,
}: {
  variant?: "sidebar" | "panel";
  className?: string;
}) {
  return (
    <form action={signOutAction} className={className}>
      <button
        type="submit"
        className={clsx(
          "cursor-pointer text-[11px] font-extrabold tracking-[0.12em] uppercase transition-colors",
          variant === "sidebar" &&
            "text-shell-ink-2 hover:text-shell-ink w-full rounded-[10px] px-1 py-2 text-left",
          variant === "panel" &&
            "border-line text-ink-2 hover:bg-surface-2 w-full rounded-xl border bg-white px-4 py-3 text-center",
        )}
      >
        Sign out
      </button>
    </form>
  );
}
