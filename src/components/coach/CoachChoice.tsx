"use client";

import { useState } from "react";
import { Card, Eyebrow } from "@/components/ui";
import { nominateCoachChoiceAction } from "@/app/actions/gamification";
import type { MemberStanding } from "@/db/queries/standings";
import { Banner, Button, Field, inputClass, useAction } from "@/components/admin/controls";

/**
 * Leader's Choice is the one MVP category the rollup cannot compute — it is a
 * judgement call, one nomination per team per week.
 */
export function CoachChoice({
  seasonId,
  weekNo,
  roster,
  current,
}: {
  seasonId: string;
  weekNo: number;
  roster: MemberStanding[];
  current: { membershipId: string; name: string; note: string | null } | null;
}) {
  const { pending, error, success, act } = useAction();
  const [membershipId, setMembershipId] = useState(
    current?.membershipId ?? roster[0]?.membershipId ?? "",
  );
  const [note, setNote] = useState(current?.note ?? "");

  if (roster.length === 0) return null;

  return (
    <Card>
      <Eyebrow>Leader&rsquo;s choice · week {weekNo}</Eyebrow>
      {current && (
        <p className="text-ink-2 mt-2 text-[13px] font-bold">
          Currently: {current.name}
          {current.note && (
            <span className="text-ink-3 font-semibold"> — {current.note}</span>
          )}
        </p>
      )}

      <div className="mt-3.5 flex flex-col gap-3">
        <Field label="Player">
          <select
            className={inputClass}
            value={membershipId}
            disabled={pending}
            onChange={(e) => setMembershipId(e.target.value)}
          >
            {roster.map((member) => (
              <option key={member.membershipId} value={member.membershipId}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why">
          <input
            className={inputClass}
            value={note}
            disabled={pending}
            placeholder="Turned the week around after a slow start"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {error && <Banner tone="error">{error}</Banner>}
        {success && <Banner tone="success">{success}</Banner>}

        <Button
          disabled={pending || !membershipId}
          onClick={() =>
            act(
              () =>
                nominateCoachChoiceAction(
                  seasonId,
                  membershipId,
                  note.trim() || null,
                ),
              { successMessage: "Nomination saved" },
            )
          }
        >
          {current ? "Update nomination" : "Nominate"}
        </Button>
      </div>
    </Card>
  );
}
