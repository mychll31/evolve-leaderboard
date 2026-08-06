"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Card, Eyebrow } from "@/components/ui";
import { checkInAction } from "@/app/actions/attendance";
import type { CheckInView } from "@/db/queries/checkin";

function timeOf(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * The member's own attendance control — the one thing a member can write.
 *
 * A check-in lands as *pending*: it does not move any score until their coach
 * approves it. Saying so on the button matters, because otherwise a member
 * taps it, sees their score unchanged, and assumes it failed.
 */
export function CheckInCard({
  membershipId,
  checkIn,
}: {
  membershipId: string;
  checkIn: CheckInView;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (checkIn.state === "no_session") {
    return (
      <Card>
        <Eyebrow>Check in</Eyebrow>
        <p className="text-ink-2 mt-2 text-[13.5px] font-semibold">
          No session today.
          {checkIn.nextMeetsOn
            ? ` Next one is ${checkIn.nextMeetsOn}.`
            : " Nothing scheduled yet."}
        </p>
      </Card>
    );
  }

  const settled = {
    pending: {
      tone: "border-accent-line bg-accent-tint",
      label: "Awaiting approval",
      icon: "⏳",
      detail: checkIn.recordedAt
        ? `You checked in at ${timeOf(checkIn.recordedAt)}${checkIn.isLate ? " · late" : ""}. Your coach still needs to approve it, so it is not counted yet.`
        : "Your coach still needs to approve it.",
    },
    present: {
      tone: "border-positive-line bg-positive-tint",
      label: checkIn.isLate ? "Present · late" : "Present",
      icon: "✓",
      detail: checkIn.recordedAt
        ? `Approved. Checked in at ${timeOf(checkIn.recordedAt)}.`
        : "Approved by your coach.",
    },
    missing: {
      tone: "border-negative-line bg-negative-tint",
      label: "Marked missing",
      icon: "✕",
      detail:
        "Your coach recorded this session as missed. Speak to them if that is wrong.",
    },
  } as const;

  if (checkIn.state !== "open") {
    const view = settled[checkIn.state];
    return (
      <Card className={clsx("border", view.tone)}>
        <Eyebrow>Today · {checkIn.meetsOn}</Eyebrow>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[18px] leading-none">{view.icon}</span>
          <span className="text-ink text-[16px] font-extrabold">
            {view.label}
          </span>
        </div>
        <p className="text-ink-2 mt-2 text-[12.5px] leading-relaxed font-semibold">
          {view.detail}
        </p>
      </Card>
    );
  }

  const startsAt = checkIn.startsAt;
  const wouldBeLate = startsAt ? Date.now() > startsAt.getTime() : false;

  return (
    <Card>
      <Eyebrow>Today · {checkIn.meetsOn}</Eyebrow>
      <p className="text-ink-2 mt-2 text-[13px] font-semibold">
        {startsAt ? `Session starts ${timeOf(startsAt)}.` : "Session today."}{" "}
        {wouldBeLate && (
          <span className="text-accent-dark">You may be marked late.</span>
        )}
      </p>

      {error && (
        <p className="text-negative mt-3 text-[12.5px] font-semibold">{error}</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await checkInAction(
              membershipId,
              checkIn.meetingId!,
            );
            if (!result.ok) setError(result.error);
          });
        }}
        className="bg-primary hover:bg-primary-dark mt-4 w-full cursor-pointer rounded-xl px-5 py-3.5 text-[13px] font-extrabold tracking-[0.06em] text-white uppercase transition-colors disabled:opacity-50"
      >
        {pending ? "Checking in…" : "Check in"}
      </button>

      <p className="text-ink-3 mt-2.5 text-[11.5px] leading-relaxed font-semibold">
        Your coach approves check-ins. Your score moves once they do.
      </p>
    </Card>
  );
}
