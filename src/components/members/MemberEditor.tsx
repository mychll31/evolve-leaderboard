"use client";

import { useState } from "react";
import clsx from "clsx";
import { Card, Eyebrow, SectionTitle } from "@/components/ui";
import { setEntryValueAction } from "@/app/actions/admin";
import { recordAttendanceAction, decideEntryAction } from "@/app/actions/attendance";
import type { AttendanceRow, MemberDetail, SeasonMetricRow } from "@/db/queries/member";
import { Banner, Button, inputClass, useAction } from "@/components/admin/controls";

function timeOf(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function AuditLine({ entry }: { entry: NonNullable<AttendanceRow["entry"]> }) {
  return (
    <div className="text-ink-4 mt-1 text-[11px] font-semibold">
      {entry.source === "self" ? "Self check-in" : `Entered by ${entry.source}`}
      {entry.recordedByName ? ` · ${entry.recordedByName}` : ""} ·{" "}
      {timeOf(entry.recordedAt)}
      {entry.decidedByName && ` · decided by ${entry.decidedByName}`}
      {entry.note && ` · ${entry.note}`}
    </div>
  );
}

function MetricEditor({
  metric,
  membershipId,
  canEdit,
  onAct,
  pending,
}: {
  metric: SeasonMetricRow;
  membershipId: string;
  canEdit: boolean;
  onAct: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState(metric.entry?.value?.toString() ?? "");

  const max =
    metric.type === "manual_score"
      ? 10
      : metric.type === "boolean"
        ? 1
        : undefined;

  return (
    <div className="border-line-2 bg-surface-2 rounded-2xl border px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-ink text-[22px] leading-none font-bold">
            {metric.name}
          </div>
          <div className="text-ink-3 mt-1.5 text-[11.5px] font-bold">
            {metric.type}
            {metric.target !== null && ` · target ${metric.target}`} · weight{" "}
            {metric.weight}%
          </div>
          {metric.entry && <AuditLine entry={metric.entry} />}
          {!metric.entry && (
            <div className="text-ink-4 mt-1 text-[11px] font-semibold">
              Not recorded
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={max}
              step={metric.type === "decimal" ? "0.1" : "1"}
              className={`${inputClass} w-24 text-right`}
              value={value}
              disabled={pending}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button
              disabled={pending || value === ""}
              onClick={() =>
                onAct(() =>
                  setEntryValueAction({
                    membershipId,
                    metricId: metric.metricId,
                    value: Number(value),
                  }),
                )
              }
            >
              Save
            </Button>
          </div>
        )}
        {!canEdit && (
          <div className="font-display text-ink text-[28px] font-extrabold">
            {metric.entry?.value ?? "—"}
          </div>
        )}
      </div>
    </div>
  );
}

export function MemberEditor({
  member,
  canEdit,
}: {
  member: MemberDetail;
  canEdit: boolean;
}) {
  const { pending, error, success, act } = useAction();

  const settled = member.attendance.filter(
    (a) => a.meetingStatus !== "scheduled",
  );

  return (
    <div className="flex flex-col gap-5">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <Card>
        <SectionTitle>SCORES</SectionTitle>
        {!canEdit && (
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            Read-only — only this member&rsquo;s coach or an admin can change
            these.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          {member.seasonMetrics.map((metric) => (
            <MetricEditor
              key={metric.metricId}
              metric={metric}
              membershipId={member.membershipId}
              canEdit={canEdit}
              onAct={(fn) => act(fn, { successMessage: "Saved" })}
              pending={pending}
            />
          ))}
          {member.seasonMetrics.length === 0 && (
            <p className="text-ink-2 text-[14px] font-semibold">
              This season has no season-level metrics.
            </p>
          )}
        </div>
      </Card>

      <Card className="min-w-0">
        <SectionTitle>ATTENDANCE</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          {settled.length} session{settled.length === 1 ? "" : "s"} so far.
          Lateness is derived from the check-in time against each session&rsquo;s
          grace period, never stored.
        </p>

        <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-line bg-surface-2 text-ink-3 border-y text-[10px] font-extrabold tracking-[0.14em] uppercase">
                <th className="px-5 py-3 text-left sm:px-6">Session</th>
                <th className="px-2 py-3 text-left">Result</th>
                <th className="px-2 py-3 text-left">Recorded</th>
                {canEdit && <th className="px-5 py-3 text-right sm:px-6">Set</th>}
              </tr>
            </thead>
            <tbody>
              {settled.map((row) => {
                const present =
                  row.entry?.status === "approved" && row.entry.value > 0;
                const label =
                  row.meetingStatus === "cancelled"
                    ? "Cancelled"
                    : !row.entry
                      ? "Not recorded"
                      : row.entry.status === "pending"
                        ? "Pending"
                        : present
                          ? row.isLate
                            ? "Present · late"
                            : "Present"
                          : "Missing";

                return (
                  <tr
                    key={row.meetingId}
                    className="border-line-2 border-b last:border-0"
                  >
                    <td className="text-ink px-5 py-3 text-[13.5px] font-bold sm:px-6">
                      {row.meetsOn}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={clsx(
                          "text-[12px] font-extrabold",
                          row.meetingStatus === "cancelled"
                            ? "text-ink-4"
                            : !row.entry
                              ? "text-negative"
                              : row.entry.status === "pending"
                                ? "text-accent"
                                : present
                                  ? row.isLate
                                    ? "text-accent-dark"
                                    : "text-positive"
                                  : "text-negative",
                        )}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {row.entry ? (
                        <div className="text-ink-2 text-[12px] font-semibold">
                          {timeOf(row.entry.recordedAt)}
                          <span className="text-ink-4">
                            {" "}
                            · {row.entry.source}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-4 text-[12px] font-semibold">
                          —
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3 text-right sm:px-6">
                        <div className="flex justify-end gap-2">
                          {row.entry?.status === "pending" ? (
                            <>
                              <Button
                                variant="ghost"
                                disabled={pending}
                                onClick={() =>
                                  act(
                                    () =>
                                      decideEntryAction(
                                        row.entry!.entryId,
                                        "rejected",
                                      ),
                                    { successMessage: "Marked missing" },
                                  )
                                }
                              >
                                Reject
                              </Button>
                              <Button
                                disabled={pending}
                                onClick={() =>
                                  act(
                                    () =>
                                      decideEntryAction(
                                        row.entry!.entryId,
                                        "approved",
                                      ),
                                    { successMessage: "Approved" },
                                  )
                                }
                              >
                                Approve
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              disabled={
                                pending || row.meetingStatus === "cancelled"
                              }
                              onClick={() =>
                                act(
                                  () =>
                                    recordAttendanceAction(
                                      member.membershipId,
                                      row.meetingId,
                                      !present,
                                    ),
                                  {
                                    successMessage: present
                                      ? "Marked missing"
                                      : "Marked present",
                                  },
                                )
                              }
                            >
                              {present ? "Mark missing" : "Mark present"}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {settled.length === 0 && (
          <p className="text-ink-2 mt-4 text-[14px] font-semibold">
            No sessions have been held yet.
          </p>
        )}
      </Card>

      <Card>
        <Eyebrow>Upcoming</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {member.attendance
            .filter((a) => a.meetingStatus === "scheduled")
            .slice(0, 12)
            .map((row) => (
              <span
                key={row.meetingId}
                className="border-line bg-surface-2 text-ink-2 rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
              >
                {row.meetsOn}
              </span>
            ))}
          {member.attendance.every((a) => a.meetingStatus !== "scheduled") && (
            <span className="text-ink-3 text-[12.5px] font-semibold">
              No sessions scheduled.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
