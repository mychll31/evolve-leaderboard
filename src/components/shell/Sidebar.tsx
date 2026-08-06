"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { buildNav } from "./nav";

export function Sidebar({
  seasonName,
  userName,
  roleLabel,
  teamName,
  initials,
  isCoach,
  isAdmin,
  signOut,
}: {
  seasonName: string;
  userName: string;
  roleLabel: string;
  teamName: string | null;
  initials: string;
  isCoach: boolean;
  isAdmin: boolean;
  /**
   * Rendered by the server layout: this is a client component, so it cannot
   * host the sign-out Server Action itself.
   */
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = buildNav({ isCoach, isAdmin });

  return (
    <aside className="bg-shell hidden w-[248px] shrink-0 flex-col px-4 py-6 lg:flex">
      <div className="px-2 pb-1">
        <Image
          src="/evolve-logo.png"
          alt="E-VOLVE"
          width={1686}
          height={406}
          priority
          className="h-7 w-auto"
        />
        <div className="font-display text-shell-ink-2 mt-2.5 text-[12px] font-bold tracking-[0.2em] uppercase">
          {seasonName}
        </div>
      </div>

      <nav className="mt-6 flex flex-col gap-[3px]">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13.5px] font-bold transition-colors",
                active
                  ? "bg-shell-2 text-white"
                  : "text-shell-ink hover:bg-shell-2/50",
              )}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{
                  background: active ? "var(--color-accent)" : "#2C3A48",
                }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="border-shell-line border-t pt-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="bg-primary font-display flex size-[34px] items-center justify-center rounded-[11px] text-[15px] font-extrabold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-bold text-[#E7EDF3]">
              {userName}
            </div>
            <div className="text-shell-ink-2 truncate text-[10.5px] font-semibold">
              {roleLabel}
              {teamName ? ` · ${teamName}` : ""}
            </div>
          </div>
        </div>

        <div className="mt-3">{signOut}</div>
      </div>
    </aside>
  );
}
