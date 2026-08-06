"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, titleFor } from "./nav";

export function TopBar({
  week,
  isCoach,
  isAdmin,
  unreadCount,
}: {
  week: number;
  isCoach: boolean;
  isAdmin: boolean;
  unreadCount: number;
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
    </header>
  );
}
