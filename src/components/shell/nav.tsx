export type NavItem = {
  href: string;
  /** Sidebar label. */
  label: string;
  /** Bottom-nav label — must stay short enough for a 65px column. */
  short: string;
  title: string;
  icon: React.ReactNode;
  /** Hidden from the phone bottom nav to keep it to five columns. */
  phone: boolean;
};

const stroke = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Icons taken from the phone design file.
const icons = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </>
  ),
  ranks: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  teams: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M18.5 20c0-2.4-1-4.5-2.5-5.8" />
    </>
  ),
  desk: (
    <>
      <path d="M9 11l2.5 2.5L16 8" />
      <rect x="3" y="4" width="18" height="17" rx="3" />
    </>
  ),
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 11a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20c0-3.6 3.4-6.2 7.5-6.2s7.5 2.6 7.5 6.2" />
    </>
  ),
  fame: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
};

export function NavIcon({
  name,
  color,
}: {
  name: keyof typeof icons;
  color: string;
}) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" stroke={color} {...stroke} aria-hidden>
      {icons[name]}
    </svg>
  );
}

export type NavName = keyof typeof icons;

export function buildNav({
  isCoach,
  isAdmin,
}: {
  isCoach: boolean;
  isAdmin: boolean;
}): (NavItem & { name: NavName })[] {
  const items: (NavItem & { name: NavName })[] = [
    { href: "/dashboard", label: "Dashboard", short: "Home", title: "Season Dashboard", name: "home", icon: null, phone: true },
    { href: "/leaderboard", label: "Leaderboard", short: "Ranks", title: "Player Leaderboard", name: "ranks", icon: null, phone: true },
    { href: "/teams", label: "Teams", short: "Teams", title: "Team Standings", name: "teams", icon: null, phone: true },
  ];

  if (isCoach) {
    items.push({ href: "/coach", label: "Coach Desk", short: "Desk", title: "Coach Desk", name: "desk", icon: null, phone: true });
  }
  if (isAdmin) {
    items.push({ href: "/admin", label: "Metric Builder", short: "Admin", title: "Metric Builder", name: "admin", icon: null, phone: true });
  }

  items.push(
    { href: "/me", label: "My Card", short: "Me", title: "My Card", name: "me", icon: null, phone: true },
    { href: "/hall-of-fame", label: "Hall of Fame", short: "Fame", title: "Hall of Fame", name: "fame", icon: null, phone: false },
  );

  return items;
}

export function titleFor(pathname: string, isAdmin: boolean, isCoach: boolean): string {
  const match = buildNav({ isCoach, isAdmin }).find((item) =>
    pathname.startsWith(item.href),
  );
  return match?.title ?? "Core+";
}
