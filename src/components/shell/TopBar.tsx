"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { NavIcon, titleFor } from "./nav";

export function TopBar({
  week,
  isCoach,
  isAdmin,
  unreadCount,
  userName,
  initials,
  subLabel,
  signOut,
}: {
  week: number;
  isCoach: boolean;
  isAdmin: boolean;
  unreadCount: number;
  userName: string;
  initials: string;
  /** Team where there is one, otherwise the role. */
  subLabel: string;
  /** Rendered by the layout so this stays a presentational shell. */
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = titleFor(pathname, isAdmin, isCoach);

  return (
    <header className="border-line flex h-[62px] shrink-0 items-center gap-3 border-b bg-white px-4 sm:h-[74px] sm:gap-5 sm:px-8">
      <Image
        src="/evolve-logo.png"
        alt="E-VOLVE"
        width={1686}
        height={406}
        priority
        className="h-5 w-auto lg:hidden"
      />
      <h1 className="font-display text-ink truncate text-[20px] font-extrabold tracking-[0.02em] sm:text-[26px]">
        {title}
      </h1>
      <div className="bg-primary-tint text-primary-dark shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.08em] sm:text-[11px]">
        WEEK {week}
      </div>

      <div className="flex-1" />

      <Link
        href="/notifications"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="hover:bg-surface-2 relative shrink-0 rounded-xl p-2 transition-colors"
      >
        <NavIcon
          name="bell"
          color={unreadCount > 0 ? "var(--color-accent)" : "var(--color-ink-3)"}
        />
        {unreadCount > 0 && (
          <span className="bg-accent absolute top-0.5 right-0.5 flex min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>

      <span aria-hidden className="bg-line hidden h-7 w-px sm:block" />

      <AccountMenu
        userName={userName}
        initials={initials}
        subLabel={subLabel}
        signOut={signOut}
      />
    </header>
  );
}

/**
 * The account control, and the only sign-out a phone has: the sidebar that
 * carries the other one is `lg:` and above.
 */
function AccountMenu({
  userName,
  initials,
  subLabel,
  signOut,
}: {
  userName: string;
  initials: string;
  subLabel: string;
  signOut: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${userName}`}
        className="hover:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors sm:pr-2.5"
      >
        <Avatar initials={initials} color="var(--color-primary)" size={34} />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="text-ink block truncate text-[13px] leading-tight font-extrabold">
            {userName}
          </span>
          <span className="text-ink-3 block truncate text-[11px] leading-tight font-semibold">
            {subLabel}
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ink-3)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="hidden sm:block"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="border-line absolute top-[calc(100%+10px)] right-0 z-50 w-60 rounded-[18px] border bg-white p-4 shadow-[0_18px_40px_-20px_rgba(15,23,32,.45)]"
        >
          <div className="text-ink truncate text-[13.5px] font-extrabold">
            {userName}
          </div>
          <div className="text-ink-3 truncate text-[11.5px] font-semibold">
            {subLabel}
          </div>
          <div className="mt-3.5">{signOut}</div>
        </div>
      )}
    </div>
  );
}
