"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  DisplayNumber,
  Eyebrow,
  SectionTitle,
  fmt,
} from "@/components/ui";
import { addPenaltyAction, deletePenaltyAction } from "@/app/actions/admin";
import type { PenaltyRow, PenaltyTargetRow } from "@/db/queries/admin";
import { Banner, Button, Field, inputClass, useAction } from "./controls";

/** The amounts an admin reaches for most, so the common case is one tap. */
const QUICK_POINTS = [1, 2, 5, 10];

function dateOf(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function PenaltiesManager({
  targets,
  penalties,
}: {
  targets: PenaltyTargetRow[];
  penalties: PenaltyRow[];
}) {
  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState({
    membershipId: "",
    points: "1",
    reason: "",
  });
  const [query, setQuery] = useState("");

  /**
   * The list is grouped per person rather than shown as one flat log: the
   * question an admin has open on this screen is "how far down is this person
   * and why", which a chronological feed answers only by making them add up
   * rows themselves.
   */
  const grouped = useMemo(() => {
    const byMember = new Map<string, PenaltyRow[]>();
    for (const row of penalties) {
      byMember.set(row.membershipId, [
        ...(byMember.get(row.membershipId) ?? []),
        row,
      ]);
    }
    return [...byMember.values()]
      .map((rows) => ({
        member: rows[0],
        rows,
        total: rows.reduce((sum, r) => sum + r.points, 0),
      }))
      .sort(
        (a, b) =>
          b.total - a.total || a.member.memberName.localeCompare(b.member.memberName),
      );
  }, [penalties]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter(
      (g) =>
        g.member.memberName.toLowerCase().includes(q) ||
        g.member.teamName.toLowerCase().includes(q),
    );
  }, [grouped, query]);

  const totalDeducted = penalties.reduce((sum, r) => sum + r.points, 0);

  // Teams in roster order, so the picker reads the way the standings do.
  const byTeam = useMemo(() => {
    const teams = new Map<string, { name: string; people: PenaltyTargetRow[] }>();
    for (const target of targets) {
      const team = teams.get(target.teamId) ?? {
        name: target.teamName,
        people: [],
      };
      team.people.push(target);
      teams.set(target.teamId, team);
    }
    return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [targets]);

  const amount = Number(draft.points);
  const canSubmit =
    draft.membershipId !== "" && Number.isFinite(amount) && amount > 0;
  const chosen = targets.find((t) => t.membershipId === draft.membershipId);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>MINUS POINTS</SectionTitle>
          <input
            className={`${inputClass} w-auto min-w-[200px]`}
            placeholder="Search name or team…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          {penalties.length === 0
            ? "Nobody has lost points this season."
            : `${fmt.penalty(totalDeducted)} points off ${grouped.length} ${
                grouped.length === 1 ? "person" : "people"
              }. Each one comes off their activity points before the percentage is calculated.`}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {visible.map(({ member, rows, total }) => (
            <div
              key={member.membershipId}
              className="border-line-2 bg-surface-2 rounded-2xl border px-4 py-3.5 sm:px-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="h-9 w-[6px] shrink-0 rounded-full"
                    style={{ background: member.teamColor }}
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/members/${member.membershipId}`}
                      className="text-ink hover:text-primary truncate text-[14px] font-extrabold"
                    >
                      {member.memberName}
                    </Link>
                    <div className="text-ink-3 truncate text-[11.5px] font-semibold">
                      {member.teamName} · {rows.length}{" "}
                      {rows.length === 1 ? "deduction" : "deductions"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Eyebrow className="text-ink-4">Off their score</Eyebrow>
                  <DisplayNumber className="text-negative text-[26px]">
                    −{fmt.penalty(total)}
                  </DisplayNumber>
                </div>
              </div>

              <ul className="border-line-2 mt-3 flex flex-col gap-2 border-t pt-3">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-negative text-[13px] font-extrabold">
                        −{fmt.penalty(row.points)}
                      </span>
                      <span className="text-ink-2 ml-2 text-[13px] font-semibold">
                        {row.reason || "No reason given"}
                      </span>
                      <div className="text-ink-4 text-[11px] font-semibold">
                        {dateOf(row.issuedAt)}
                        {row.issuedByName ? ` · by ${row.issuedByName}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        act(() => deletePenaltyAction(row.id), {
                          successMessage: `${fmt.penalty(row.points)} points returned to ${member.memberName}`,
                        })
                      }
                    >
                      Undo
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {visible.length === 0 && (
            <p className="text-ink-2 text-[14px] font-semibold">
              {penalties.length === 0
                ? "No minus points yet."
                : "Nobody matches that search."}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>TAKE POINTS OFF</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Deducted from the person&apos;s activity-point total. Their percentage
          and team score update automatically. Totals never go below zero.
        </p>

        <div className="mt-4 flex flex-col gap-3.5">
          <Field label="Person">
            <select
              className={inputClass}
              value={draft.membershipId}
              disabled={pending || targets.length === 0}
              onChange={(e) =>
                setDraft({ ...draft, membershipId: e.target.value })
              }
            >
              <option value="">— select person —</option>
              {byTeam.map((team) => (
                <optgroup key={team.name} label={team.name}>
                  {team.people.map((person) => (
                    <option
                      key={person.membershipId}
                      value={person.membershipId}
                    >
                      {person.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Minus points" hint="How many points to take off.">
            <input
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              className={inputClass}
              value={draft.points}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, points: e.target.value })}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            {QUICK_POINTS.map((n) => (
              <Button
                key={n}
                variant={Number(draft.points) === n ? "primary" : "ghost"}
                disabled={pending}
                onClick={() => setDraft({ ...draft, points: String(n) })}
              >
                −{n}
              </Button>
            ))}
          </div>

          <Field label="Reason" hint="Shown to the person on their own page.">
            <input
              className={inputClass}
              placeholder="Missed two sessions"
              value={draft.reason}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            />
          </Field>

          {error && <Banner tone="error">{error}</Banner>}
          {success && <Banner tone="success">{success}</Banner>}

          <Button
            variant="danger"
            disabled={pending || !canSubmit}
            onClick={() =>
              act(
                () =>
                  addPenaltyAction({
                    membershipId: draft.membershipId,
                    points: amount,
                    reason: draft.reason,
                  }),
                {
                  successMessage: `${fmt.penalty(amount)} points off ${chosen?.name ?? "them"}`,
                  onDone: () =>
                    setDraft({ membershipId: "", points: "1", reason: "" }),
                },
              )
            }
          >
            Take points off
          </Button>

          {targets.length === 0 && (
            <p className="text-ink-3 text-[12px] font-semibold">
              Nobody is on a team yet. Add people at Admin → People first.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
