"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Card, Eyebrow, SectionTitle } from "@/components/ui";
import {
  approveAllAction,
  decideEntryAction,
  recordAttendanceAction,
} from "@/app/actions/attendance";
import type { ApprovalRow, CoachDesk } from "@/db/queries/coach";

const STATE_STYLE: Record<
  ApprovalRow["state"],
  { border: string; label: string; tone: string }
> = {
  pending: { border: "border-accent-line", label: "AWAITING REVIEW", tone: "text-accent" },
  present: { border: "border-positive-line", label: "✓ PRESENT", tone: "text-positive" },
  missing: { border: "border-negative-line", label: "✕ MISSING", tone: "text-negative" },
  unrecorded: { border: "border-line", label: "NOT RECORDED", tone: "text-ink-4" },
};

export function AttendanceList({ desk }: { desk: CoachDesk }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!desk.meeting) {
    return (
      <Card>
        <SectionTitle>NO SESSION YET</SectionTitle>
        <p className="text-ink-2 mt-2 text-[14px]">
          No sessions have been held for this season. Once the calendar has a
          past session, attendance appears here.
        </p>
      </Card>
    );
  }

  const meetingId = desk.meeting.id;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Something went wrong");
    });
  };

  const pendingIds = desk.rows
    .filter((r) => r.state === "pending")
    .map((r) => r.membershipId);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>
            {desk.meeting.isToday ? "TODAY'S ATTENDANCE" : "LATEST SESSION"} ·{" "}
            {desk.teamName.toUpperCase()}
          </SectionTitle>
          <p className="text-ink-3 mt-1 text-[11.5px] font-semibold">
            {desk.meeting.meetsOn} · late after {desk.meeting.lateAfterMinutes}{" "}
            min
          </p>
        </div>
        {pendingIds.length > 0 && (
          <button
            onClick={() => act(() => approveAllAction(meetingId, pendingIds))}
            disabled={pending}
            className="bg-primary-tint text-primary-dark cursor-pointer rounded-[9px] px-4 py-2.5 text-[11.5px] font-extrabold tracking-[0.06em] uppercase disabled:opacity-50"
          >
            Approve all ({pendingIds.length})
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="border-negative-line bg-negative-tint text-negative mt-4 rounded-xl border px-4 py-3 text-[13px] font-semibold"
        >
          {error}
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2.5">
        {desk.rows.map((row) => {
          const style = STATE_STYLE[row.state];
          return (
            <li
              key={row.membershipId}
              className={clsx(
                "bg-card flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-3.5 transition-colors sm:gap-4",
                style.border,
              )}
            >
              <div className="bg-surface-2 font-display text-ink-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-[16px] font-extrabold">
                {row.initials}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/members/${row.membershipId}`}
                  className="text-ink hover:text-primary block truncate text-[14.5px] font-bold"
                >
                  {row.name}
                </Link>
                <div
                  className={clsx(
                    "truncate text-[11.5px] font-semibold",
                    row.isLate || row.state === "unrecorded"
                      ? "text-[#C2410C]"
                      : "text-ink-3",
                  )}
                >
                  {row.note}
                  {row.source && row.source !== "self" && (
                    <span className="text-ink-4"> · by {row.source}</span>
                  )}
                </div>
              </div>

              {row.state === "pending" ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() =>
                      act(() => decideEntryAction(row.entryId!, "rejected"))
                    }
                    disabled={pending}
                    className="bg-surface-2 text-ink-2 cursor-pointer rounded-[9px] px-4 py-2.5 text-[11.5px] font-extrabold tracking-[0.06em] uppercase disabled:opacity-50"
                  >
                    Mark missing
                  </button>
                  <button
                    onClick={() =>
                      act(() => decideEntryAction(row.entryId!, "approved"))
                    }
                    disabled={pending}
                    className="bg-primary cursor-pointer rounded-[9px] px-5 py-2.5 text-[11.5px] font-extrabold tracking-[0.06em] text-white uppercase disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={clsx(
                      "text-[11.5px] font-extrabold tracking-[0.08em]",
                      style.tone,
                    )}
                  >
                    {style.label}
                  </span>
                  <button
                    onClick={() =>
                      act(() =>
                        recordAttendanceAction(
                          row.membershipId,
                          meetingId,
                          row.state !== "present",
                        ),
                      )
                    }
                    disabled={pending}
                    className="border-line text-ink-2 hover:bg-surface-2 cursor-pointer rounded-[9px] border px-3 py-2 text-[11px] font-extrabold tracking-[0.06em] uppercase disabled:opacity-50"
                  >
                    {row.state === "present" ? "Mark missing" : "Mark present"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {desk.rows.length === 0 && (
        <p className="text-ink-2 mt-4 text-[14px] font-semibold">
          No members on this team yet.
        </p>
      )}
    </Card>
  );
}

export function DeskCounters({ desk }: { desk: CoachDesk }) {
  // Check-ins count immediately, so there is no approval queue. What a coach
  // needs to see is who is still unaccounted for.
  const tiles = [
    {
      label: "Present",
      value: desk.presentCount,
      className: "border-positive-line bg-positive-tint",
      text: "text-positive",
      eyebrow: "text-[#4A8460]",
    },
    {
      label: "Missing",
      value: desk.missingCount,
      className: "border-negative-line bg-negative-tint",
      text: "text-negative",
      eyebrow: "text-[#9E5757]",
    },
    {
      label: "Not recorded",
      value: desk.unrecordedCount + desk.pendingCount,
      className: "border-accent-line bg-accent-tint",
      text: "text-accent",
      eyebrow: "text-[#A97A4E]",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={clsx("rounded-[18px] border px-4 py-4 sm:px-5", tile.className)}
        >
          <Eyebrow className={tile.eyebrow}>{tile.label}</Eyebrow>
          <div
            className={clsx(
              "font-display mt-0.5 text-[36px] leading-none font-extrabold tabular-nums sm:text-[46px]",
              tile.text,
            )}
          >
            {tile.value}
          </div>
        </div>
      ))}
    </div>
  );
}
