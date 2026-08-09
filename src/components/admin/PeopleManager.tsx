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
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    teamId: teams[0]?.id ?? "",
    role: "member" as "member" | "coach",
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((person) => {
      if (filter === "assigned" && !person.teamId) return false;
      if (filter === "unassigned" && person.teamId) return false;
      if (!q) return true;
      return (
        person.name.toLowerCase().includes(q) ||
        person.email.toLowerCase().includes(q) ||
        (person.teamName ?? "").toLowerCase().includes(q)
      );
    });
  }, [people, query, filter]);

  const assign = (person: PersonRow, teamId: string) => {
    if (!teamId) {
      if (!person.membershipId || !person.active) return;
      act(
        () => setMembershipActiveAction(person.membershipId!, false),
        { successMessage: `${person.name} unassigned` },
      );
      return;
    }

    act(
      () =>
        upsertMembershipAction({
          seasonId,
          userId: person.userId,
          teamId,
          role: person.seasonRole ?? "member",
          position: null,
        }),
      { successMessage: `${person.name} assigned` },
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                              position: null,
                            }),
                          { successMessage: `${person.name} updated` },
                        )
                      }
                    >
                      <option value="member">Member</option>
                      <option value="coach">Leader</option>
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
                                    ? `${person.name} unassigned`
                                    : `${person.name} restored`,
                                },
                              )
                            }
                          >
                            {person.active ? "Unassign" : "Restore"}
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
          <Field label="Team">
            <select
              className={inputClass}
              value={draft.teamId}
              disabled={pending || teams.length === 0}
              onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
            >
              <option value="">— select team —</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              value={draft.role}
              disabled={pending}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  role: e.target.value as "member" | "coach",
                })
              }
            >
              <option value="member">Member</option>
              <option value="coach">Leader</option>
            </select>
          </Field>

          {error && <Banner tone="error">{error}</Banner>}
          {success && <Banner tone="success">{success}</Banner>}

          <Button
            disabled={pending || !draft.teamId}
            onClick={() =>
              act(async () => {
                const created = await createUserAction({
                  name: draft.name,
                  email: draft.email,
                });
                if (!created.ok || !created.data) return created;

                const assigned = await upsertMembershipAction({
                  seasonId,
                  userId: created.data,
                  teamId: draft.teamId,
                  role: draft.role,
                  position: null,
                });
                return assigned;
              }, {
                successMessage: "Person added",
                onDone: () =>
                  setDraft({
                    name: "",
                    email: "",
                    teamId: teams[0]?.id ?? "",
                    role: "member",
                  }),
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
