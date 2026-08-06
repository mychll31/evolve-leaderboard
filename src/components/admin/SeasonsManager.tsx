"use client";

import { useState } from "react";
import { Card, DisplayNumber, Eyebrow, SectionTitle } from "@/components/ui";
import {
  cloneSeasonAction,
  createSeasonAction,
  deleteSeasonAction,
  setSeasonStatusAction,
  updateSeasonAction,
} from "@/app/actions/admin";
import type { SeasonSummary } from "@/db/queries/admin";
import type { Formula } from "@/domain/types";
import {
  Banner,
  Button,
  Field,
  StatusPill,
  inputClass,
  useAction,
} from "./controls";

type Draft = {
  name: string;
  startsOn: string;
  endsOn: string;
  formula: Formula;
};

const EMPTY: Draft = {
  name: "",
  startsOn: "",
  endsOn: "",
  formula: "weighted",
};

export function SeasonsManager({ seasons }: { seasons: SeasonSummary[] }) {
  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [cloneFrom, setCloneFrom] = useState<string | null>(null);

  const submit = () => {
    const input = { ...draft, name: draft.name.trim() };
    if (cloneFrom) {
      act(() => cloneSeasonAction(cloneFrom, input), {
        successMessage: "Season cloned. Teams, metrics and coaches carried over.",
        onDone: () => {
          setDraft(EMPTY);
          setCloneFrom(null);
        },
      });
    } else if (editing) {
      act(() => updateSeasonAction(editing, input), {
        successMessage: "Season updated",
        onDone: () => {
          setDraft(EMPTY);
          setEditing(null);
        },
      });
    } else {
      act(() => createSeasonAction(input), {
        successMessage: "Season created as a draft",
        onDone: () => setDraft(EMPTY),
      });
    }
  };

  const title = cloneFrom
    ? "CLONE SEASON"
    : editing
      ? "EDIT SEASON"
      : "NEW SEASON";

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        {seasons.map((season) => {
          const canRemove =
            season.status === "draft" || season.status === "archived";
          const removeTitle =
            season.status === "active"
              ? "Lock and archive this season before removing it"
              : season.status === "locked"
                ? "Archive this season before removing it"
                : undefined;
          const removeMessage =
            season.status === "archived"
              ? `Remove ${season.name}? This permanently deletes its history.`
              : `Remove ${season.name}? This permanently deletes its setup.`;

          return (
            <Card key={season.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <SectionTitle className="tracking-normal">
                      {season.name}
                    </SectionTitle>
                    <StatusPill status={season.status} />
                  </div>
                  <div className="text-ink-3 mt-1.5 text-[12px] font-semibold">
                    {season.startsOn} → {season.endsOn} · {season.formula}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {season.status === "draft" && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        act(() => setSeasonStatusAction(season.id, "active"), {
                          successMessage: `${season.name} is now the active season`,
                        })
                      }
                    >
                      Activate
                    </Button>
                  )}
                  {season.status === "active" && (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        act(() => setSeasonStatusAction(season.id, "locked"), {
                          successMessage: `${season.name} locked — still readable, no longer editable`,
                        })
                      }
                    >
                      Lock
                    </Button>
                  )}
                  {season.status === "locked" && (
                    <>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          act(() => setSeasonStatusAction(season.id, "active"), {
                            successMessage: `${season.name} reopened`,
                          })
                        }
                      >
                        Unlock
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          act(() => setSeasonStatusAction(season.id, "archived"), {
                            successMessage: `${season.name} archived`,
                          })
                        }
                      >
                        Archive
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setCloneFrom(season.id);
                      setEditing(null);
                      setDraft({
                        name: `${season.name} (copy)`,
                        startsOn: "",
                        endsOn: "",
                        formula: season.formula,
                      });
                    }}
                  >
                    Clone
                  </Button>
                  {season.status !== "archived" && season.status !== "locked" && (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setEditing(season.id);
                        setCloneFrom(null);
                        setDraft({
                          name: season.name,
                          startsOn: season.startsOn,
                          endsOn: season.endsOn,
                          formula: season.formula,
                        });
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    disabled={pending || !canRemove}
                    title={removeTitle}
                    onClick={() => {
                      const confirmed = window.confirm(removeMessage);
                      if (!confirmed) return;

                      act(() => deleteSeasonAction(season.id), {
                        successMessage: `${season.name} removed`,
                        onDone: () => {
                          if (editing === season.id || cloneFrom === season.id) {
                            setEditing(null);
                            setCloneFrom(null);
                            setDraft(EMPTY);
                          }
                        },
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Teams", value: season.teamCount },
                  { label: "Members", value: season.memberCount },
                  { label: "Sessions", value: season.meetingCount },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-surface-2 rounded-xl px-3.5 py-2.5"
                  >
                    <Eyebrow>{stat.label}</Eyebrow>
                    <DisplayNumber className="text-ink mt-0.5 text-[23px]">
                      {stat.value}
                    </DisplayNumber>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <SectionTitle>{title}</SectionTitle>
        {cloneFrom && (
          <p className="text-ink-3 mt-2 text-[12px] font-semibold">
            Teams, metrics and coach assignments carry over. Members, scores and
            badges do not — rosters change between seasons.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3.5">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Leaderboard Season 2"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input
                type="date"
                className={inputClass}
                value={draft.startsOn}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <input
                type="date"
                className={inputClass}
                value={draft.endsOn}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Formula">
            <select
              className={inputClass}
              value={draft.formula}
              disabled={pending}
              onChange={(e) =>
                setDraft({ ...draft, formula: e.target.value as Formula })
              }
            >
              <option value="weighted">Weighted</option>
              <option value="points">Points</option>
              <option value="average">Average</option>
            </select>
          </Field>

          {error && <Banner tone="error">{error}</Banner>}
          {success && <Banner tone="success">{success}</Banner>}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {cloneFrom ? "Clone" : editing ? "Save" : "Create"}
            </Button>
            {(editing || cloneFrom) && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setEditing(null);
                  setCloneFrom(null);
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
