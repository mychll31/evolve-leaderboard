"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { titleFor } from "./nav";

export function TopBar({
  week,
  isCoach,
  isAdmin,
}: {
  week: number;
  isCoach: boolean;
  isAdmin: boolean;
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
    </header>
  );
}
