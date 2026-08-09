"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/admin", label: "Metrics" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/badges", label: "Badges" },
  { href: "/admin/import", label: "Import" },
  { href: "/report", label: "Report" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="border-line bg-card inline-flex gap-1 rounded-xl border p-1">
        {TABS.map((tab) => {
          // /admin is the metrics tab, so it must match exactly or every
          // sub-route would light it up as well.
          const active =
            tab.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "rounded-[9px] px-4 py-2 text-[11.5px] font-extrabold tracking-[0.08em] whitespace-nowrap uppercase transition-colors",
                active ? "bg-primary text-white" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
