"use client";

import { useState } from "react";
import { Card, DisplayNumber, Eyebrow, SectionTitle } from "@/components/ui";
import {
  createMeetingAction,
  deleteMeetingAction,
  generateMeetingsAction,
  markHeldThroughAction,
  updateMeetingAction,
} from "@/app/actions/admin";
import type { MeetingRow } from "@/db/queries/admin";
import {
  Banner,
  Button,
  Field,
  StatusPill,
  inputClass,
  useAction,
} from "./controls";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function timeOf(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export function CalendarManager({
  seasonId,
  seasonStart,
  seasonEnd,
  meetings,
  today,
}: {
  seasonId: string;
  seasonStart: string;
  seasonEnd: string;
  meetings: MeetingRow[];
  today: string;
}) {
  const { pending, error, success, act } = useAction();
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [grace, setGrace] = useState(5);
  const [oneOff, setOneOff] = useState({ meetsOn: "", startTime: "09:00" });

  const held = meetings.filter((m) => m.status === "held").length;
  const scheduled = meetings.filter((m) => m.status === "scheduled").length;
  const cancelled = meetings.filter((m) => m.status === "cancelled").length;

  const toggle = (day: number) =>
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
    );

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Held", value: held },
            { label: "Scheduled", value: scheduled },
            { label: "Cancelled", value: cancelled },
          ].map((stat) => (
            <Card key={stat.label} className="py-4">
              <Eyebrow>{stat.label}</Eyebrow>
              <DisplayNumber className="text-ink mt-0.5 text-[30px]">
                {stat.value}
              </DisplayNumber>
            </Card>
          ))}
        </div>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>SESSIONS</SectionTitle>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                act(() => markHeldThroughAction(seasonId, today), {
                  successMessage: "Past sessions marked as held",
                })
              }
            >
              Mark past as held
            </Button>
          </div>

          {meetings.length === 0 ? (
            <p className="text-ink-2 mt-4 text-[14px] font-semibold">
              No sessions yet. Generate them from a recurrence rule to get
              started — attendance, streaks and the heatmap all derive from this
              calendar.
            </p>
          ) : (
            <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-line text-ink-3 border-y bg-surface-2 text-[10px] font-extrabold tracking-[0.14em] uppercase">
                    <th className="px-5 py-3 text-left sm:px-6">Date</th>
                    <th className="px-2 py-3 text-left">Time</th>
                    <th className="px-2 py-3 text-left">Status</th>
                    <th className="px-2 py-3 text-right">Present</th>
                    <th className="px-5 py-3 text-right sm:px-6">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((meeting) => (
                    <tr
                      key={meeting.id}
                      className="border-line-2 border-b last:border-0"
                    >
                      <td className="text-ink px-5 py-3 text-[13.5px] font-bold sm:px-6">
                        {meeting.meetsOn}
                      </td>
                      <td className="text-ink-2 px-2 py-3 text-[13px] font-semibold">
                        {timeOf(meeting.startsAt)}
                        <span className="text-ink-4"> +{meeting.lateAfterMinutes}m</span>
                      </td>
                      <td className="px-2 py-3">
                        <StatusPill status={meeting.status} />
                      </td>
                      <td className="text-ink-2 px-2 py-3 text-right text-[13px] font-bold">
                        {meeting.entryCount > 0
                          ? `${meeting.presentCount}/${meeting.entryCount}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        <div className="flex justify-end gap-2">
                          {meeting.status !== "held" && (
                            <Button
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                act(() =>
                                  updateMeetingAction(meeting.id, {
                                    status: "held",
                                  }),
                                )
                              }
                            >
                              Held
                            </Button>
                          )}
                          {meeting.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                act(() =>
                                  updateMeetingAction(meeting.id, {
                                    status: "cancelled",
                                  }),
                                )
                              }
                            >
                              Cancel
                            </Button>
                          )}
                          {meeting.entryCount === 0 && (
                            <Button
                              variant="danger"
                              disabled={pending}
                              onClick={() =>
                                act(() => deleteMeetingAction(meeting.id))
                              }
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <SectionTitle>GENERATE</SectionTitle>
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            Existing dates are skipped, never overwritten — safe to run again
            after extending the season.
          </p>

          <div className="mt-4 flex flex-col gap-3.5">
            <Field label="Weekdays">
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const on = weekdays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggle(day.value)}
                      aria-pressed={on}
                      className={`cursor-pointer rounded-lg px-3 py-2 text-[12px] font-extrabold transition-colors ${
                        on
                          ? "bg-primary text-white"
                          : "border-line text-ink-2 border bg-white"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time">
                <input
                  type="time"
                  className={inputClass}
                  value={startTime}
                  disabled={pending}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field label="Late after (min)">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={grace}
                  disabled={pending}
                  onChange={(e) => setGrace(Number(e.target.value))}
                />
              </Field>
            </div>

            <Button
              disabled={pending}
              onClick={() =>
                act(
                  () =>
                    generateMeetingsAction(seasonId, {
                      weekdays,
                      startTime,
                      lateAfterMinutes: grace,
                    }),
                  { successMessage: "Calendar generated" },
                )
              }
            >
              Generate {seasonStart} → {seasonEnd}
            </Button>
          </div>
        </Card>

        <Card>
          <SectionTitle>ONE-OFF SESSION</SectionTitle>
          <div className="mt-4 flex flex-col gap-3.5">
            <Field label="Date">
              <input
                type="date"
                min={seasonStart}
                max={seasonEnd}
                className={inputClass}
                value={oneOff.meetsOn}
                disabled={pending}
                onChange={(e) =>
                  setOneOff({ ...oneOff, meetsOn: e.target.value })
                }
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                className={inputClass}
                value={oneOff.startTime}
                disabled={pending}
                onChange={(e) =>
                  setOneOff({ ...oneOff, startTime: e.target.value })
                }
              />
            </Field>
            <Button
              variant="ghost"
              disabled={pending || !oneOff.meetsOn}
              onClick={() =>
                act(
                  () =>
                    createMeetingAction(seasonId, {
                      meetsOn: oneOff.meetsOn,
                      startTime: oneOff.startTime,
                      lateAfterMinutes: grace,
                    }),
                  {
                    successMessage: "Session added",
                    onDone: () => setOneOff({ ...oneOff, meetsOn: "" }),
                  },
                )
              }
            >
              Add session
            </Button>
          </div>
        </Card>

        {error && <Banner tone="error">{error}</Banner>}
        {success && <Banner tone="success">{success}</Banner>}
      </div>
    </div>
  );
}
