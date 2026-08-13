"use client";

import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import {
  createMetricAction,
  reorderMetricsAction,
  setMetricActiveAction,
  updateMetricAction,
} from "@/app/actions/admin";
import type { MetricRow } from "@/db/queries/admin";
import { Banner, Button, Field, inputClass, useAction } from "./controls";
import { moveItem } from "./order";

type Draft = {
  name: string;
};

const EMPTY: Draft = { name: "" };

/**
 * Reordering rewrites every row's sortOrder and revalidates the admin and score
 * paths, so a burst of clicks waits for a pause and saves once rather than
 * thirty times. The list itself moves on the click, not on the response.
 */
const SAVE_DELAY_MS = 600;

export function MetricsManager({
  seasonId,
  metrics,
}: {
  seasonId: string;
  metrics: MetricRow[];
}) {
  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<MetricRow | null>(null);
  const [order, setOrder] = useState<MetricRow[]>(metrics);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsaved = useRef(false);

  // Accept the server's list except while a local reorder is still in flight,
  // where the revalidated prop can arrive a step behind what was clicked.
  useEffect(() => {
    if (!unsaved.current) setOrder(metrics);
  }, [metrics]);

  // A rejected save (a locked season is the realistic case) drops the optimistic
  // move, so the list never shows an order the database does not have.
  useEffect(() => {
    if (!error) return;
    unsaved.current = false;
    setOrder(metrics);
  }, [error, metrics]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;

    const next = moveItem(order, index, delta);
    setOrder(next);
    unsaved.current = true;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      act(
        () =>
          reorderMetricsAction(
            seasonId,
            next.map((m) => m.id),
          ),
        {
          successMessage: "Order saved",
          // Another click may have queued a newer save while this one was in
          // flight; that one still owns the local order.
          onDone: () => {
            if (!timer.current) unsaved.current = false;
          },
        },
      );
    }, SAVE_DELAY_MS);
  };

  const submit = () => {
    const input = {
      name: draft.name,
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
        successMessage: "Metric created",
        onDone: () => setDraft(EMPTY),
      });
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <SectionTitle>METRICS</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Every active metric counts equally toward the total.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {order.map((metric, index) => (
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
                    Counts equally{metric.hasEntries && " · has data"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="compact"
                      disabled={index === 0}
                      aria-label={`Move ${metric.name} up`}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="compact"
                      disabled={index === order.length - 1}
                      aria-label={`Move ${metric.name} down`}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditing(metric);
                      setDraft({
                        name: metric.name,
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
