import { eq } from "drizzle-orm";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  ReportFilters,
  type ReportFilterOption,
  type ReportStatus,
} from "@/components/report/ReportFilters";
import {
  ReportSheet,
  type ReportSort,
} from "@/components/report/ReportSheet";
import { Card, DisplayNumber, Eyebrow, StatTile, fmt } from "@/components/ui";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import {
  getSeasonReport,
  type ReportMember,
  type SeasonReport,
} from "@/db/queries/teams";
import { teams as teamTable } from "@/db/schema";

type ReportSearchParams = {
  q?: string | string[];
  team?: string | string[];
  metric?: string | string[];
  status?: string | string[];
  sort?: string | string[];
};

function paramValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((item) =>
    item
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function paramString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function validIds(values: string[], allowed: Set<string>): string[] {
  return Array.from(new Set(values)).filter((value) => allowed.has(value));
}

function matchesSearch(member: ReportMember, query: string): boolean {
  return [member.name, member.teamName, member.position ?? "", member.initials]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

function sortReportMembers(members: ReportMember[], total: number) {
  return {
    finished: members
      .filter((member) => total > 0 && member.doneCount === total)
      .sort((a, b) => a.name.localeCompare(b.name)),
    outstanding: members
      .filter((member) => total === 0 || member.doneCount < total)
      .sort(
        (a, b) => a.doneCount - b.doneCount || a.name.localeCompare(b.name),
      ),
  };
}

/**
 * Keeps the members a predicate accepts and rebuilds the team roll-ups and the
 * finished/outstanding split around them, so every filter narrows the report
 * the same way.
 */
function narrowReport(
  report: SeasonReport,
  keep: (member: ReportMember) => boolean,
): SeasonReport {
  const members = report.members.filter(keep);
  const teams = report.teams
    .map((team) => {
      const teamMembers = members
        .filter((member) => member.teamId === team.teamId)
        .sort(
          (a, b) => a.doneCount - b.doneCount || a.name.localeCompare(b.name),
        );
      if (teamMembers.length === 0) return null;
      return {
        ...team,
        members: teamMembers,
        finished: teamMembers.filter(
          (member) => member.doneCount === report.total,
        ).length,
      };
    })
    .filter((team): team is SeasonReport["teams"][number] => Boolean(team));
  const { finished, outstanding } = sortReportMembers(members, report.total);

  return {
    ...report,
    teams,
    members,
    finished,
    outstanding,
  };
}

/**
 * "Logged" means every metric currently in view, and "not logged" means at
 * least one of them is outstanding. With a single metric selected that reads
 * exactly as it sounds: who has done this one, and who has not.
 */
function matchesStatus(
  member: ReportMember,
  status: ReportStatus,
  total: number,
): boolean {
  if (status === "all") return true;
  const finished = total > 0 && member.doneCount === total;
  return status === "logged" ? finished : !finished;
}

/**
 * Who has done their list, and who has not.
 *
 * Scope is the whole point: an admin is checking on the programme, so they see
 * everyone; a member is checking on their own group, so they see their team.
 * A Leader sits between the two and sees the teams they lead.
 */
export default async function ReportPage(props: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const ctx = await getAppContext();
  const db = getDb();
  const searchParams = await props.searchParams;

  const ownTeamId = ctx.membershipId
    ? ctx.standings.members.find((m) => m.membershipId === ctx.membershipId)
        ?.teamId
    : null;

  const teamIds = ctx.isAdmin
    ? null
    : Array.from(
        new Set([
          ...ctx.coachedTeams.map((team) => team.id),
          ...(ownTeamId ? [ownTeamId] : []),
        ]),
      );

  const teamOptions: ReportFilterOption[] = ctx.isAdmin
    ? (
        await db
          .select({
            id: teamTable.id,
            name: teamTable.name,
            color: teamTable.color,
          })
          .from(teamTable)
          .where(eq(teamTable.seasonId, ctx.standings.season.id))
          .orderBy(teamTable.sortOrder)
      ).map((team) => ({
        id: team.id,
        name: team.name,
        color: team.color,
      }))
    : [];
  const metricOptions: ReportFilterOption[] = ctx.standings.metrics.map(
    (metric) => ({
      id: metric.id,
      name: metric.name,
    }),
  );
  const selectedTeamIds = ctx.isAdmin
    ? validIds(
        paramValues(searchParams.team),
        new Set(teamOptions.map((team) => team.id)),
      )
    : [];
  const selectedMetricIds = validIds(
    paramValues(searchParams.metric),
    new Set(metricOptions.map((metric) => metric.id)),
  );
  const search = paramString(searchParams.q);
  const statusParam = paramString(searchParams.status);
  const status: ReportStatus =
    statusParam === "logged" || statusParam === "not-logged"
      ? statusParam
      : "all";
  const sortParam = paramString(searchParams.sort);
  const sort: ReportSort =
    sortParam === "name" || sortParam === "name-desc" ? sortParam : "team";
  // Clicking Name walks A-Z, then Z-A, then back to grouping by team, and
  // carries every other filter along so a sorted view stays a shareable link.
  const nextSort: ReportSort =
    sort === "name" ? "name-desc" : sort === "name-desc" ? "team" : "name";
  const sortHref = (() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    selectedTeamIds.forEach((id) => params.append("team", id));
    selectedMetricIds.forEach((id) => params.append("metric", id));
    if (statusParam === "logged" || statusParam === "not-logged") {
      params.set("status", statusParam);
    }
    if (nextSort !== "team") params.set("sort", nextSort);
    const qs = params.toString();
    return qs ? `/report?${qs}` : "/report";
  })();
  const scopedTeamIds = ctx.isAdmin
    ? selectedTeamIds.length > 0
      ? selectedTeamIds
      : null
    : teamIds;
  const metricIds = selectedMetricIds.length > 0 ? selectedMetricIds : null;
  const unsearchedReport = await getSeasonReport(
    db,
    ctx.standings,
    scopedTeamIds,
    metricIds,
  );
  const report = narrowReport(
    unsearchedReport,
    (member) =>
      (!search || matchesSearch(member, search)) &&
      matchesStatus(member, status, unsearchedReport.total),
  );

  const people = report.members.length;
  const scopePeople = unsearchedReport.members.length;
  const scope = ctx.isAdmin
    ? selectedTeamIds.length > 0
      ? teamOptions
          .filter((team) => selectedTeamIds.includes(team.id))
          .map((team) => team.name)
          .join(", ")
      : "Everyone"
    : unsearchedReport.teams.map((t) => t.name).join(", ") || "You";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {ctx.isAdmin && <AdminNav />}

      <div
        className="relative min-w-0 overflow-hidden rounded-[22px] p-5 sm:p-7"
        style={{
          background: "linear-gradient(112deg,#12B5CB 0%,#0F1720 118%)",
        }}
      >
        <div className="relative flex min-w-0 flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-white/80 uppercase">
              Who has finished
            </div>
            <DisplayNumber className="mt-2 truncate text-[34px] text-white sm:text-[44px]">
              {scope}
            </DisplayNumber>
            <p className="mt-1.5 text-[12.5px] font-semibold text-white/85">
              {people} of {scopePeople}{" "}
              {scopePeople === 1 ? "person" : "people"} · {report.total}{" "}
              metric{report.total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-3 gap-2.5">
            <StatTile
              tone="onColor"
              label="All done"
              value={report.finished.length}
            />
            <StatTile
              tone="onColor"
              label="Still going"
              value={report.outstanding.length}
            />
            <StatTile
              tone="onColor"
              label="Finished"
              value={
                people === 0
                  ? "0%"
                  : fmt.pct((report.finished.length / people) * 100)
              }
            />
          </div>
        </div>
      </div>

      <ReportFilters
        teams={teamOptions}
        metrics={metricOptions}
        selectedTeamIds={selectedTeamIds}
        selectedMetricIds={selectedMetricIds}
        search={search}
        status={status}
        sort={sort === "team" ? undefined : sort}
        showTeamFilter={ctx.isAdmin}
      />

      {people === 0 ? (
        <Card>
          <Eyebrow>Results</Eyebrow>
          <p className="text-ink-2 mt-2 text-[14px] font-semibold">
            {scopePeople === 0
              ? ctx.isAdmin
                ? "Nobody is on a team yet, so there is nothing to report."
                : "You are not on a team yet, so there is nothing to report."
              : status === "logged"
                ? "Nobody has logged everything in view yet."
                : "No people match these filters."}
          </p>
        </Card>
      ) : (
        <ReportSheet report={report} sort={sort} nameSortHref={sortHref} />
      )}
    </div>
  );
}
