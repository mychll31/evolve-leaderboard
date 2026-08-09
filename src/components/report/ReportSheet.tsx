import Link from "next/link";
import type { SeasonReport } from "@/db/queries/teams";

/** Default groups by team; the Name header switches to a plain A-Z. */
export type ReportSort = "team" | "name" | "name-desc";

/**
 * The report as a spreadsheet: one row per person, one column per metric.
 *
 * Gridlines on every cell and a header row that stays put while the rows
 * scroll. Twenty-eight metrics is far past what fits on a screen, so the sheet
 * scrolls sideways rather than shrinking the text until nobody can read it.
 */

/** Column widths, so a long metric name wraps instead of stretching a column. */
const NAME_W = 190;
const TEAM_W = 140;
const METRIC_W = 190;

/**
 * Borders per cell rather than `border-collapse: collapse`: with collapse,
 * browsers ignore `z-index` on cells, so the sticky header row cannot stay
 * above the rows scrolling under it.
 */
const cell =
  "border-line border-r border-b px-3 py-2 align-middle whitespace-nowrap text-[12.5px]";

/**
 * The header row stays put while the rows scroll; it must be opaque and
 * out-rank the cells beneath, both inline so neither depends on a utility
 * class being present in the stylesheet.
 */
const headerCell = (width: number) => ({
  position: "sticky" as const,
  top: 0,
  zIndex: 20,
  background: "var(--color-surface-2)",
  width,
  minWidth: width,
});

export function ReportSheet({
  report,
  sort = "team",
  nameSortHref,
}: {
  report: SeasonReport;
  sort?: ReportSort;
  /** Where the Name header points, which is whatever sort comes next. */
  nameSortHref?: string;
}) {
  const rows = [...report.members].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "name-desc") return b.name.localeCompare(a.name);
    return (
      a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name)
    );
  });

  return (
    <div className="border-line bg-card overflow-auto rounded-[14px] border">
      <table
        style={{ width: "max-content", borderCollapse: "separate", borderSpacing: 0 }}
      >
        <thead>
          <tr className="bg-surface-2 text-ink-2 text-left font-extrabold">
            <th
              scope="col"
              className={cell}
              style={headerCell(NAME_W)}
            >
              {nameSortHref ? (
                <Link
                  href={nameSortHref}
                  scroll={false}
                  className="hover:text-primary flex items-center gap-1.5"
                  aria-label={
                    sort === "name"
                      ? "Sorted by name A to Z. Sort Z to A"
                      : sort === "name-desc"
                        ? "Sorted by name Z to A. Group by team"
                        : "Grouped by team. Sort by name A to Z"
                  }
                >
                  Name
                  <span aria-hidden className="text-ink-3 text-[10px]">
                    {sort === "name" ? "▲" : sort === "name-desc" ? "▼" : "↕"}
                  </span>
                </Link>
              ) : (
                "Name"
              )}
            </th>
            <th
              scope="col"
              className={cell}
              style={headerCell(TEAM_W)}
            >
              Team
            </th>
            {report.metrics.map((metric) => (
              <th
                key={metric.metricId}
                scope="col"
                className={`${cell} align-bottom`}
                style={{
                  ...headerCell(METRIC_W),
                  whiteSpace: "normal",
                }}
                title={metric.name}
              >
                {metric.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((member) => {
            const done = new Set(member.doneMetricIds);
            return (
              <tr key={member.membershipId} className="bg-card">
                <th
                  scope="row"
                  className={`${cell} text-ink font-extrabold`}
                  style={{ width: NAME_W, minWidth: NAME_W }}
                >
                  <Link
                    href={`/members/${member.membershipId}`}
                    className="hover:text-primary block truncate"
                    title={member.name}
                  >
                    {member.name}
                  </Link>
                </th>
                <td
                  className={`${cell} text-ink-2 font-semibold`}
                  style={{ width: TEAM_W, minWidth: TEAM_W }}
                >
                  <span className="block truncate" title={member.teamName}>
                    {member.teamName}
                  </span>
                </td>
                {report.metrics.map((metric) => {
                  const logged = done.has(metric.metricId);
                  return (
                    <td
                      key={metric.metricId}
                      className={`${cell} font-semibold ${
                        logged ? "text-positive" : "text-ink-3"
                      }`}
                    >
                      {logged ? "Logged" : "Not logged"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
