"use client";

import Link from "next/link";
import clsx from "clsx";
import { Card, SectionTitle } from "@/components/ui";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/gamification";
import type { NotificationRow } from "@/db/queries/gamification";
import { Banner, Button, useAction } from "@/components/admin/controls";

const ICONS: Record<string, string> = {
  badge_earned: "🏅",
  mvp_awarded: "🏆",
  missing_work: "⚠️",
  attendance_late: "⏰",
  season_ending: "🏁",
};

function relative(date: Date, now: number): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toISOString().slice(0, 10);
}

export function NotificationList({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  const { pending, error, act } = useAction();
  const now = Date.now();
  const unread = notifications.filter((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>
            NOTIFICATIONS
            {unread.length > 0 && (
              <span className="text-accent ml-2 text-[14px]">
                {unread.length} new
              </span>
            )}
          </SectionTitle>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => act(() => markAllNotificationsReadAction())}
            >
              Mark all read
            </Button>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        {notifications.length === 0 ? (
          <p className="text-ink-2 mt-5 text-[14px] font-semibold">
            Nothing yet. Badges, weekly MVPs and outstanding work will appear
            here after the next weekly rollup.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {notifications.map((n) => {
              const body = (
                <div className="flex items-start gap-3.5">
                  <span className="text-[22px] leading-none">
                    {ICONS[n.kind] ?? "🔔"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink text-[14px] font-extrabold">
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-ink-2 mt-0.5 text-[12.5px] font-semibold">
                        {n.body}
                      </div>
                    )}
                    <div className="text-ink-4 mt-1 text-[11px] font-bold">
                      {relative(n.createdAt, now)}
                    </div>
                  </div>
                  {!n.readAt && (
                    <span
                      aria-label="Unread"
                      className="bg-accent mt-1.5 size-2 shrink-0 rounded-full"
                    />
                  )}
                </div>
              );

              return (
                <li
                  key={n.id}
                  className={clsx(
                    "rounded-2xl border px-4 py-3.5 transition-colors",
                    n.readAt
                      ? "border-line bg-card"
                      : "border-accent-line bg-accent-tint",
                  )}
                >
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => {
                        if (!n.readAt) act(() => markNotificationReadAction(n.id));
                      }}
                      className="block"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full cursor-pointer text-left"
                      disabled={pending || Boolean(n.readAt)}
                      onClick={() => act(() => markNotificationReadAction(n.id))}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
