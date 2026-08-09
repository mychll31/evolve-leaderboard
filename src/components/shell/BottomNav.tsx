"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildNav, NavIcon } from "./nav";

/** Phone navigation, from the Core+ Season App design. */
export function BottomNav({
  isCoach,
  isAdmin,
}: {
  isCoach: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const items = buildNav({ isCoach, isAdmin }).filter((i) => i.phone);

  return (
    <nav className="border-line fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t bg-white/96 px-2 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const color = active ? "var(--color-primary)" : "var(--color-ink-4)";
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex min-w-[58px] flex-1 flex-col items-center gap-1.5 pt-1"
          >
            <NavIcon name={item.name} color={color} />
            <span
              className="text-[9.5px] font-extrabold tracking-[0.06em] uppercase"
              style={{ color }}
            >
              {item.short}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
