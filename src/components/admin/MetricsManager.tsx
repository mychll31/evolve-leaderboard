"use client";

import { useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import {
  createMetricAction,
  setMetricActiveAction,
  updateMetricAction,
} from "@/app/actions/admin";
import type { MetricRow } from "@/db/queries/admin";
import type { Formula, MetricType } from "@/domain/types";
import { Banner, Button, Field, inputClass, useAction } from "./controls";

const TYPES: { value: MetricType; label: string; hint: string }[] = [
  { value: "percentage", label: "Percentage", hint: "0-100, recorded per session" },
  { value: "integer", label: "Whole number", hint: "A count, scaled against a target" },
  { value: "decimal", label: "Decimal", hint: "An average, scaled against a target" },
  { value: "boolean", label: "Yes / no", hint: "Done or not done" },
  { value: "manual_score", label: "Manual score", hint: "Coach enters 1-10" },
];

type Draft = {
  name: string;
  type: MetricType;
  target: string;
  required: boolean;
};

const EMPTY: Draft = { name: "", type: "integer", target: "10", required: false };

export function MetricsManager({
  seasonId,
  metrics,
  formula,
}: {
  seasonId: string;
  metrics: MetricRow[];
  formula: Formula;
}) {
  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<MetricRow | null>(null);

  const needsTarget = draft.type === "integer" || draft.type === "decimal";

  const submit = () => {
    const input = {
      name: draft.name,
      type: draft.type,
      target: needsTarget ? Number(draft.target) : null,
      required: draft.required,
    };
    if (editing) {
      act(() => updateMetricAction(editing.id, input), {
        successMessage: "Metric updated",
        onDone: () => {
          setEditing(null);
          setDraft(EMPTY);
        },
      });
    } else {
      act(() => createMetricAction(seasonId, input), {
        successMessage:
          "Metric created at weight 0 — raise it once there is data behind it",
        onDone: () => setDraft(EMPTY),
      });
    }
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <SectionTitle>METRICS</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Weights and the formula live on the Metrics tab of the builder. Adding
          a metric here never changes anyone&rsquo;s score until you give it a
          weight.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.id}
              className={`border-line-2 bg-surface-2 rounded-2xl border px-5 py-4 ${metric.active ? "" : "opacity-60"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-ink truncate text-[22px] leading-none font-bold">
                    {metric.name}
                    {!metric.active && (
                      <span className="text-ink-4 ml-2 text-[11px] font-extrabold tracking-[0.1em]">
                        ARCHIVED
                      </span>
                    )}
                  </div>
                  <div className="text-ink-3 mt-1.5 text-[11.5px] font-bold tracking-[0.04em]">
                    {metric.type}
                    {metric.target !== null && ` · target ${metric.target}`} ·
                    weight {metric.weight}% ·{" "}
                    {metric.required ? "required" : "optional"}
                    {metric.hasEntries && " · has data"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditing(metric);
                      setDraft({
                        name: metric.name,
                        type: metric.type,
                        target: metric.target?.toString() ?? "",
                        required: metric.required,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={metric.active ? "danger" : "ghost"}
                    disabled={pending}
                    onClick={() =>
                      act(
                        () => setMetricActiveAction(metric.id, !metric.active),
                        {
                          successMessage: metric.active
                            ? `${metric.name} archived — its history is kept`
                            : `${metric.name} restored`,
                        },
                      )
                    }
                  >
                    {metric.active ? "Archive" : "Restore"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>{editing ? "EDIT METRIC" : "NEW METRIC"}</SectionTitle>

        {!editing && formula !== "weighted" && (
          <div className="mt-3">
            <Banner tone="warning">
              This season uses the <strong>{formula}</strong> formula, which
              ignores weights. A new metric will start counting immediately and
              lower every score until values are recorded against it.
            </Banner>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3.5">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Leadership"
            />
          </Field>

          <Field
            label="Type"
            hint={
              editing?.hasEntries
                ? "Locked: this metric already has recorded values, and changing its type would reinterpret them."
                : TYPES.find((t) => t.value === draft.type)?.hint
            }
          >
            <select
              className={inputClass}
              value={draft.type}
              disabled={pending || editing?.hasEntries}
              onChange={(e) =>
                setDraft({ ...draft, type: e.target.value as MetricType })
              }
            >
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>

          {needsTarget && (
            <Field
              label="Target"
              hint="What counts as 100%. Seven of a target of eight scores 87.5."
            >
              <input
                type="number"
                min={1}
                className={inputClass}
                value={draft.target}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              />
            </Field>
          )}

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={draft.required}
              disabled={pending}
              onChange={(e) =>
                setDraft({ ...draft, required: e.target.checked })
              }
              className="size-4"
            />
            <span className="text-ink-2 text-[13px] font-bold">Required</span>
          </label>

          {error && <Banner tone="error">{error}</Banner>}
          {success && <Banner tone="success">{success}</Banner>}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {editing ? "Save" : "Create"}
            </Button>
            {editing && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setEditing(null);
                  setDraft(EMPTY);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
