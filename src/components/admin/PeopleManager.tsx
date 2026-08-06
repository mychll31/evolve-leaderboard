"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import {
  createUserAction,
  setMembershipActiveAction,
  updateUserAction,
  upsertMembershipAction,
} from "@/app/actions/admin";
import type { PersonRow, TeamRow } from "@/db/queries/admin";
import { Banner, Button, Field, inputClass, useAction } from "./controls";

const POSITIONS = ["", "PG", "SG", "SF", "PF", "C"];

export function PeopleManager({
  seasonId,
  people,
  teams,
  currentUserId,
}: {
  seasonId: string;
  people: PersonRow[];
  teams: TeamRow[];
  currentUserId: string;
}) {
  const { pending, error, success, act } = useAction();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [draft, setDraft] = useState({ name: "", email: "" });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((person) => {
      if (filter === "assigned" && !person.membershipId) return false;
      if (filter === "unassigned" && person.membershipId) return false;
      if (!q) return true;
      return (
        person.name.toLowerCase().includes(q) ||
        person.email.toLowerCase().includes(q) ||
        (person.teamName ?? "").toLowerCase().includes(q)
      );
    });
  }, [people, query, filter]);

  const assign = (person: PersonRow, teamId: string) => {
    if (!teamId) return;
    act(
      () =>
        upsertMembershipAction({
          seasonId,
          userId: person.userId,
          teamId,
          role: person.seasonRole ?? "member",
          position: person.position,
        }),
      { successMessage: `${person.name} assigned` },
    );
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>PEOPLE</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputClass} w-auto min-w-[200px]`}
              placeholder="Search name, email or team…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className={`${inputClass} w-auto`}
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "assigned" | "unassigned")
              }
            >
              <option value="all">Everyone</option>
              <option value="assigned">On a team</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        </div>

        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          {visible.length} of {people.length} shown
        </p>

        <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-line bg-surface-2 text-ink-3 border-y text-[10px] font-extrabold tracking-[0.14em] uppercase">
                <th className="px-5 py-3 text-left sm:px-6">Name</th>
                <th className="px-2 py-3 text-left">Team</th>
                <th className="px-2 py-3 text-left">Role</th>
                <th className="px-2 py-3 text-left">Pos</th>
                <th className="px-5 py-3 text-right sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((person) => (
                <tr
                  key={person.userId}
                  className="border-line-2 border-b last:border-0"
                >
                  <td className="px-5 py-3 sm:px-6">
                    <div className="text-ink text-[13.5px] font-bold">
                      {person.name || "—"}
                      {person.globalRole === "super_admin" && (
                        <span className="text-accent ml-2 text-[10px] font-extrabold tracking-[0.1em]">
                          ADMIN
                        </span>
                      )}
                      {person.membershipId && !person.active && (
                        <span className="text-ink-4 ml-2 text-[10px] font-extrabold tracking-[0.1em]">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-ink-3 text-[11.5px] font-semibold">
                      {person.email}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <select
                      className={`${inputClass} w-auto min-w-[130px] py-1.5 text-[12.5px]`}
                      value={person.teamId ?? ""}
                      disabled={pending}
                      onChange={(e) => assign(person, e.target.value)}
                    >
                      <option value="">— unassigned —</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-3">
                    <select
                      className={`${inputClass} w-auto py-1.5 text-[12.5px]`}
                      value={person.seasonRole ?? "member"}
                      disabled={pending || !person.teamId}
                      onChange={(e) =>
                        act(
                          () =>
                            upsertMembershipAction({
                              seasonId,
                              userId: person.userId,
                              teamId: person.teamId!,
                              role: e.target.value as "member" | "coach",
                              position: person.position,
                            }),
                          { successMessage: `${person.name} updated` },
                        )
                      }
                    >
                      <option value="member">Member</option>
                      <option value="coach">Coach</option>
                    </select>
                  </td>
                  <td className="px-2 py-3">
                    <select
                      className={`${inputClass} w-auto py-1.5 text-[12.5px]`}
                      value={person.position ?? ""}
                      disabled={pending || !person.teamId}
                      onChange={(e) =>
                        act(() =>
                          upsertMembershipAction({
                            seasonId,
                            userId: person.userId,
                            teamId: person.teamId!,
                            role: person.seasonRole ?? "member",
                            position: e.target.value || null,
                          }),
                        )
                      }
                    >
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos || "—"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right sm:px-6">
                    <div className="flex justify-end gap-2">
                      {person.membershipId && (
                        <>
                          <Link
                            href={`/members/${person.membershipId}`}
                            className="border-line text-ink-2 hover:bg-surface-2 rounded-[10px] border bg-white px-3 py-2 text-[11.5px] font-extrabold tracking-[0.06em] uppercase"
                          >
                            Open
                          </Link>
                          <Button
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              act(
                                () =>
                                  setMembershipActiveAction(
                                    person.membershipId!,
                                    !person.active,
                                  ),
                                {
                                  successMessage: person.active
                                    ? `${person.name} removed from the roster`
                                    : `${person.name} restored`,
                                },
                              )
                            }
                          >
                            {person.active ? "Deactivate" : "Restore"}
                          </Button>
                        </>
                      )}
                      {person.globalRole !== "super_admin" && (
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            act(
                              () =>
                                updateUserAction(person.userId, {
                                  name: person.name,
                                  email: person.email,
                                  role: "super_admin",
                                }),
                              { successMessage: `${person.name} is now an admin` },
                            )
                          }
                        >
                          Make admin
                        </Button>
                      )}
                      {person.globalRole === "super_admin" &&
                        person.userId !== currentUserId && (
                          <Button
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              act(
                                () =>
                                  updateUserAction(person.userId, {
                                    name: person.name,
                                    email: person.email,
                                    role: "user",
                                  }),
                                { successMessage: `${person.name} is no longer an admin` },
                              )
                            }
                          >
                            Revoke admin
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle>ADD PERSON</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Leaderboard is invite-only: an address must exist here before that Google
          account can sign in.
        </p>
        <div className="mt-4 flex flex-col gap-3.5">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={draft.email}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>

          {error && <Banner tone="error">{error}</Banner>}
          {success && <Banner tone="success">{success}</Banner>}

          <Button
            disabled={pending}
            onClick={() =>
              act(() => createUserAction(draft), {
                successMessage: "Person added — now assign them a team",
                onDone: () => setDraft({ name: "", email: "" }),
              })
            }
          >
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
