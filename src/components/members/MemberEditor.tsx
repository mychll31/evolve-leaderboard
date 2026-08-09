"use client";

import { Card, SectionTitle } from "@/components/ui";
import { deleteEntryAction, setEntryValueAction } from "@/app/actions/admin";
import type { MemberDetail, SeasonMetricRow } from "@/db/queries/member";
import { Banner, Button, useAction } from "@/components/admin/controls";

function timeOf(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function sourceLabel(source: NonNullable<SeasonMetricRow["entry"]>["source"]) {
  if (source === "self") return "Self check-in";
  if (source === "coach") return "Entered by Leader";
  return `Entered by ${source}`;
}

function AuditLine({ entry }: { entry: NonNullable<SeasonMetricRow["entry"]> }) {
  return (
    <div className="text-ink-4 mt-1 text-[11px] font-semibold">
      {sourceLabel(entry.source)}
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
  const isLogged = (metric.entry?.value ?? 0) > 0;

  return (
    <div className="border-line-2 bg-surface-2 rounded-2xl border px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-ink text-[22px] leading-none font-bold">
            {metric.name}
          </div>
          {canEdit && (
            <div className="text-ink-3 mt-1.5 text-[11.5px] font-bold">
              {isLogged ? "Logged" : "Not logged"}
            </div>
          )}
          {/* Who recorded it, when, and any note is for the person who can
              change it. A teammate reading the page sees done or not done. */}
          {canEdit && metric.entry && <AuditLine entry={metric.entry} />}
          {canEdit && !metric.entry && (
            <div className="text-ink-4 mt-1 text-[11px] font-semibold">
              Not recorded
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center rounded-xl border border-line bg-white p-1">
            <Button
              variant={isLogged ? "primary" : "ghost"}
              disabled={pending}
              onClick={() => {
                if (isLogged) return;
                onAct(() =>
                  setEntryValueAction({
                    membershipId,
                    metricId: metric.metricId,
                    value: 100,
                  }),
                );
              }}
            >
              Logged
            </Button>
            <Button
              variant={!isLogged ? "primary" : "ghost"}
              disabled={pending}
              onClick={() => {
                const entryId = metric.entry?.entryId;
                if (!entryId) return;
                onAct(() => deleteEntryAction(entryId));
              }}
            >
              Not logged
            </Button>
          </div>
        )}
        {!canEdit && (
          <div
            className={`text-[13px] font-extrabold tracking-[0.06em] uppercase ${
              (metric.entry?.value ?? 0) > 0 ? "text-positive" : "text-ink-4"
            }`}
          >
            {(metric.entry?.value ?? 0) > 0 ? "Done" : "Not yet"}
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

  return (
    <div className="flex flex-col gap-5">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <Card>
        <SectionTitle>THEIR LIST</SectionTitle>
        {!canEdit && (
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            You can see how they are doing, but only their leader can change
            anything here.
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
              No metrics have been added yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
