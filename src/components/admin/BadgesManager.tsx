"use client";

import { useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import {
  createBadgeAction,
  setBadgeActiveAction,
  updateBadgeAction,
  type BadgeInput,
} from "@/app/actions/gamification";
import {
  describeBadgeRule,
  parseBadgeRule,
  type BadgeRule,
  type BadgeRuleType,
} from "@/domain/badges";
import { Banner, Button, Field, inputClass, useAction } from "./controls";

export type AdminBadge = {
  id: string;
  icon: string;
  name: string;
  requirementText: string;
  ruleJson: string | null;
  active: boolean;
  holders: number;
};

const RULE_TYPES: { value: BadgeRuleType | "none"; label: string }[] = [
  { value: "none", label: "No automatic rule (grant by hand)" },
  { value: "streak", label: "Streak reaches N sessions" },
  { value: "metric_at_least", label: "A metric reaches N%" },
  { value: "all_metrics_at_least", label: "Every metric reaches N%" },
  { value: "rank_at_most", label: "Finish the week in the top N" },
  { value: "most_improved", label: "Biggest rank gain of the week" },
  { value: "has_any_entry", label: "First value recorded for a metric" },
];

type Draft = {
  icon: string;
  name: string;
  requirementText: string;
  ruleType: BadgeRuleType | "none";
  number: string;
  metricKey: string;
};

function toRule(draft: Draft): BadgeRule | null {
  const n = Number(draft.number);
  switch (draft.ruleType) {
    case "streak":
      return { type: "streak", threshold: n };
    case "metric_at_least":
      return {
        type: "metric_at_least",
        metricKey: draft.metricKey,
        value: n,
      };
    case "all_metrics_at_least":
      return { type: "all_metrics_at_least", value: n };
    case "rank_at_most":
      return { type: "rank_at_most", value: n };
    case "most_improved":
      return { type: "most_improved" };
    case "has_any_entry":
      return { type: "has_any_entry", metricKey: draft.metricKey };
    default:
      return null;
  }
}

function fromBadge(badge: AdminBadge, fallbackMetric: string): Draft {
  const rule = parseBadgeRule(badge.ruleJson);
  const base: Draft = {
    icon: badge.icon,
    name: badge.name,
    requirementText: badge.requirementText,
    ruleType: rule?.type ?? "none",
    number: "5",
    metricKey: fallbackMetric,
  };
  if (!rule) return base;
  if (rule.type === "streak") return { ...base, number: String(rule.threshold) };
  if (rule.type === "metric_at_least")
    return { ...base, number: String(rule.value), metricKey: rule.metricKey };
  if (rule.type === "all_metrics_at_least")
    return { ...base, number: String(rule.value) };
  if (rule.type === "rank_at_most") return { ...base, number: String(rule.value) };
  if (rule.type === "has_any_entry")
    return { ...base, metricKey: rule.metricKey };
  return base;
}

export function BadgesManager({
  badges,
  metrics,
}: {
  badges: AdminBadge[];
  metrics: { key: string; name: string }[];
}) {
  const fallbackMetric = metrics[0]?.key ?? "attendance";
  const empty: Draft = {
    icon: "🏅",
    name: "",
    requirementText: "",
    ruleType: "streak",
    number: "5",
    metricKey: fallbackMetric,
  };

  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<AdminBadge | null>(null);

  const needsNumber =
    draft.ruleType === "streak" ||
    draft.ruleType === "metric_at_least" ||
    draft.ruleType === "all_metrics_at_least" ||
    draft.ruleType === "rank_at_most";
  const needsMetric =
    draft.ruleType === "metric_at_least" || draft.ruleType === "has_any_entry";

  const preview = toRule(draft);

  const submit = () => {
    const input: BadgeInput = {
      icon: draft.icon,
      name: draft.name,
      requirementText: draft.requirementText,
      rule: preview,
    };
    if (editing) {
      act(() => updateBadgeAction(editing.id, input), {
        successMessage: "Badge updated",
        onDone: () => {
          setEditing(null);
          setDraft(empty);
        },
      });
    } else {
      act(() => createBadgeAction(input), {
        successMessage: "Badge created — it will be awarded on the next rollup",
        onDone: () => setDraft(empty),
      });
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <SectionTitle>BADGES</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Rules are evaluated by the weekly rollup. A badge with no rule stays
          displayable but is never awarded automatically. Awards are permanent —
          a badge is not revoked if the condition later lapses.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {badges.map((badge) => {
            const rule = parseBadgeRule(badge.ruleJson);
            return (
              <div
                key={badge.id}
                className={`border-line-2 bg-surface-2 flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-5 py-4 ${badge.active ? "" : "opacity-60"}`}
              >
                <div className="flex min-w-0 gap-3.5">
                  <span className="text-[26px] leading-none">{badge.icon}</span>
                  <div className="min-w-0">
                    <div className="font-display text-ink text-[21px] leading-none font-bold">
                      {badge.name}
                      {!badge.active && (
                        <span className="text-ink-4 ml-2 text-[11px] font-extrabold tracking-[0.1em]">
                          ARCHIVED
                        </span>
                      )}
                    </div>
                    <div className="text-ink-3 mt-1.5 text-[11.5px] font-bold">
                      {rule ? describeBadgeRule(rule) : "Manual grant only"} ·{" "}
                      {badge.holders} held
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditing(badge);
                      setDraft(fromBadge(badge, fallbackMetric));
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={badge.active ? "danger" : "ghost"}
                    disabled={pending}
                    onClick={() =>
                      act(() => setBadgeActiveAction(badge.id, !badge.active), {
                        successMessage: badge.active
                          ? `${badge.name} archived`
                          : `${badge.name} restored`,
                      })
                    }
                  >
                    {badge.active ? "Archive" : "Restore"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>{editing ? "EDIT BADGE" : "NEW BADGE"}</SectionTitle>

        <div className="mt-4 flex flex-col gap-3.5">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <Field label="Icon">
              <input
                className={`${inputClass} text-center text-[20px]`}
                value={draft.icon}
                maxLength={4}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              />
            </Field>
            <Field label="Name">
              <input
                className={inputClass}
                value={draft.name}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Iron Will"
              />
            </Field>
          </div>

          <Field label="Description">
            <input
              className={inputClass}
              value={draft.requirementText}
              disabled={pending}
              onChange={(e) =>
                setDraft({ ...draft, requirementText: e.target.value })
              }
              placeholder="Shown on the badge card"
            />
          </Field>

          <Field label="Award rule">
            <select
              className={inputClass}
              value={draft.ruleType}
              disabled={pending}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  ruleType: e.target.value as BadgeRuleType | "none",
                })
              }
            >
              {RULE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>

          {(needsNumber || needsMetric) && (
            <div className="grid grid-cols-2 gap-3">
              {needsMetric && (
                <Field label="Metric">
                  <select
                    className={inputClass}
                    value={draft.metricKey}
                    disabled={pending}
                    onChange={(e) =>
                      setDraft({ ...draft, metricKey: e.target.value })
                    }
                  >
                    {metrics.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {needsNumber && (
                <Field label="Value">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={draft.number}
                    disabled={pending}
                    onChange={(e) =>
                      setDraft({ ...draft, number: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
          )}

          {preview && (
            <Banner tone="warning">
              Awarded when: <strong>{describeBadgeRule(preview)}</strong>
            </Banner>
          )}

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
                  setDraft(empty);
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
