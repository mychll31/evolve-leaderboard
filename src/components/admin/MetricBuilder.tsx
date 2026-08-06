"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import {
  Card,
  DisplayNumber,
  Eyebrow,
  SectionTitle,
  fmt,
  rankColor,
} from "@/components/ui";
import {
  updateMetricWeightAction,
  updateSeasonFormulaAction,
} from "@/app/actions/metrics";
import { combine } from "@/domain/scoring/combine";
import type { Formula } from "@/domain/types";
import type { MemberStanding } from "@/db/queries/standings";

export type BuilderMetric = {
  id: string;
  key: string;
  name: string;
  type: string;
  weight: number;
  required: boolean;
};

const FORMULA_OPTIONS: { id: Formula; label: string }[] = [
  { id: "weighted", label: "Weighted" },
  { id: "points", label: "Points" },
  { id: "average", label: "Average" },
];

const STEP = 5;

export function MetricBuilder({
  seasonId,
  metrics,
  formula,
  members,
}: {
  seasonId: string;
  metrics: BuilderMetric[];
  formula: Formula;
  members: MemberStanding[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Optimistic so the live preview reorders on click rather than after the
  // round trip — the whole point of the panel is seeing the effect.
  const [weights, setWeights] = useOptimistic(
    Object.fromEntries(metrics.map((m) => [m.id, m.weight])) as Record<string, number>,
  );
  const [activeFormula, setActiveFormula] = useOptimistic(formula);

  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  const balanced = Math.round(total) === 100;

  /** Recomputed client-side from the normalised values already on each row. */
  const preview = useMemo(() => {
    return [...members]
      .map((member) => ({
        member,
        score: combine(
          member.breakdown.map((b) => ({
            weight: weights[b.metricId] ?? b.weight,
            value: b.value,
          })),
          activeFormula,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [members, weights, activeFormula]);

  const bump = (metric: BuilderMetric, delta: number) => {
    const next = Math.max(0, Math.min(100, (weights[metric.id] ?? 0) + delta));
    setError(null);
    startTransition(async () => {
      setWeights({ ...weights, [metric.id]: next });
      const result = await updateMetricWeightAction(metric.id, next);
      if (!result.ok) setError(result.error);
    });
  };

  const pickFormula = (next: Formula) => {
    setError(null);
    startTransition(async () => {
      setActiveFormula(next);
      const result = await updateSeasonFormulaAction(seasonId, next);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_372px]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3.5">
          <SectionTitle>FORMULA</SectionTitle>
          <div className="border-line bg-surface flex gap-1 rounded-xl border p-1">
            {FORMULA_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => pickFormula(option.id)}
                disabled={pending}
                aria-pressed={activeFormula === option.id}
                className={clsx(
                  "cursor-pointer rounded-[9px] px-4 py-2 text-[11.5px] font-extrabold tracking-[0.08em] uppercase transition-colors disabled:opacity-60",
                  activeFormula === option.id
                    ? "bg-primary text-white"
                    : "text-ink-2",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {activeFormula !== "weighted" && (
          <p className="text-ink-3 mt-3 text-[12.5px] font-semibold">
            {activeFormula === "points"
              ? "Points mode sums each metric's normalised score, so weights are ignored and totals can exceed 100."
              : "Average mode takes the unweighted mean of each metric, so weights are ignored."}
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="border-negative-line bg-negative-tint text-negative mt-4 rounded-xl border px-4 py-3 text-[13px] font-semibold"
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3.5">
          {metrics.map((metric) => (
            <div
              key={metric.id}
              className="border-line-2 bg-surface-2 rounded-2xl border px-5 py-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-ink truncate text-[24px] leading-none font-bold tracking-[0.03em] sm:text-[27px]">
                    {metric.name}
                  </div>
                  <div className="text-ink-3 mt-1.5 text-[11.5px] font-bold tracking-[0.06em]">
                    {metric.type} · {metric.required ? "Required" : "Optional"}
                  </div>
                </div>
                <DisplayNumber
                  className={clsx(
                    "shrink-0 text-[36px] sm:text-[40px]",
                    activeFormula === "weighted" ? "text-accent" : "text-ink-4",
                  )}
                >
                  {weights[metric.id] ?? 0}%
                </DisplayNumber>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => bump(metric, -STEP)}
                  disabled={pending || activeFormula !== "weighted"}
                  aria-label={`Decrease ${metric.name} weight`}
                  className="border-line text-ink-2 flex size-9.5 cursor-pointer items-center justify-center rounded-xl border bg-white text-[19px] font-extrabold disabled:opacity-40"
                >
                  −
                </button>
                <div className="bg-line-2 h-2.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${weights[metric.id] ?? 0}%`,
                      background: "linear-gradient(90deg,#F97316,#FBA85E)",
                    }}
                  />
                </div>
                <button
                  onClick={() => bump(metric, STEP)}
                  disabled={pending || activeFormula !== "weighted"}
                  aria-label={`Increase ${metric.name} weight`}
                  className="border-line text-ink-2 flex size-9.5 cursor-pointer items-center justify-center rounded-xl border bg-white text-[19px] font-extrabold disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div
          className={clsx(
            "mt-4 flex items-center justify-between rounded-2xl border px-5 py-4",
            balanced
              ? "border-positive-line bg-positive-tint"
              : "border-accent-line bg-accent-tint",
          )}
        >
          <span className="text-ink-2 text-[12px] font-extrabold tracking-[0.1em] uppercase">
            Total weight
          </span>
          <DisplayNumber
            className={clsx(
              "text-[32px]",
              balanced ? "text-positive" : "text-accent",
            )}
          >
            {Math.round(total)}%
          </DisplayNumber>
        </div>
        {!balanced && activeFormula === "weighted" && (
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            Weights need not total 100 — scores divide by the actual total — but
            100 keeps the numbers readable.
          </p>
        )}
      </Card>

      <Card>
        <Eyebrow>Live preview · top 5</Eyebrow>
        <ul className="mt-3.5 flex flex-col gap-3">
          {preview.map((row, i) => (
            <li key={row.member.membershipId} className="flex items-center gap-2.5">
              <DisplayNumber
                className="w-[18px] text-[17px]"
                style={{ color: rankColor(i + 1) }}
              >
                {i + 1}
              </DisplayNumber>
              <span className="text-ink-2 min-w-0 flex-1 truncate text-[13px] font-bold">
                {row.member.name}
              </span>
              <DisplayNumber className="text-ink text-[19px]">
                {fmt.total(row.score)}
              </DisplayNumber>
            </li>
          ))}
        </ul>
        <p className="text-ink-3 mt-4 text-[11.5px] font-semibold">
          Recomputed as you adjust weights. Changes are saved immediately and
          apply to every screen.
        </p>
      </Card>
    </div>
  );
}
