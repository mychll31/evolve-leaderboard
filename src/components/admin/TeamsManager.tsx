"use client";

import { useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import {
  assignCoachAction,
  createTeamAction,
  deleteTeamAction,
  removeCoachAction,
  updateTeamAction,
} from "@/app/actions/admin";
import type { PersonRow, TeamRow } from "@/db/queries/admin";
import { Banner, Button, Field, inputClass, useAction } from "./controls";

type Draft = { name: string; abbr: string; color: string };

const EMPTY: Draft = { name: "", abbr: "", color: "#12B5CB" };

export function TeamsManager({
  seasonId,
  teams,
  people,
}: {
  seasonId: string;
  teams: TeamRow[];
  people: PersonRow[];
}) {
  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team) => (
          <Card key={team.id}>
            <div className="flex items-center gap-3">
              <div
                className="font-display flex size-11 shrink-0 items-center justify-center rounded-[13px] text-[17px] font-extrabold text-white"
                style={{ background: team.color }}
              >
                {team.abbr}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-ink truncate text-[22px] leading-tight font-bold">
                  {team.name}
                </div>
                <div className="text-ink-3 truncate text-[11.5px] font-semibold">
                  {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Field label="Coach">
                <select
                  className={inputClass}
                  value={team.coachUserId ?? ""}
                  disabled={pending}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) {
                      act(() => removeCoachAction(team.id), {
                        successMessage: `Coach removed from ${team.name}`,
                      });
                    } else {
                      act(() => assignCoachAction(team.id, value), {
                        successMessage: `Coach assigned to ${team.name}`,
                      });
                    }
                  }}
                >
                  <option value="">— none —</option>
                  {people.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name || person.email}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setEditing(team.id);
                  setDraft({
                    name: team.name,
                    abbr: team.abbr,
                    color: team.color,
                  });
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                disabled={pending || team.memberCount > 0}
                title={
                  team.memberCount > 0
                    ? "Move its members to another team first"
                    : undefined
                }
                onClick={() =>
                  act(() => deleteTeamAction(team.id), {
                    successMessage: `${team.name} deleted`,
                  })
                }
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle>{editing ? "EDIT TEAM" : "NEW TEAM"}</SectionTitle>
        <div className="mt-4 flex flex-col gap-3.5">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Comets"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Abbreviation" hint="Up to 4 characters">
              <input
                className={inputClass}
                value={draft.abbr}
                maxLength={4}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, abbr: e.target.value })}
                placeholder="CMT"
              />
            </Field>
            <Field label="Colour">
              <input
                type="color"
                className={`${inputClass} h-[42px] p-1`}
                value={draft.color}
                disabled={pending}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </Field>
          </div>

          {error && <Banner tone="error">{error}</Banner>}
          {success && <Banner tone="success">{success}</Banner>}

          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                editing
                  ? act(() => updateTeamAction(editing, draft), {
                      successMessage: "Team updated",
                      onDone: () => {
                        setEditing(null);
                        setDraft(EMPTY);
                      },
                    })
                  : act(() => createTeamAction(seasonId, draft), {
                      successMessage: "Team created",
                      onDone: () => setDraft(EMPTY),
                    })
              }
            >
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
