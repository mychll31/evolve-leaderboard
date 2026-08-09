import Link from "next/link";
import type { SeasonReport } from "@/db/queries/teams";

/** Default groups by team; the Name header switches to a plain A-Z. */
export type ReportSort = "team" | "name" | "name-desc";

/**
 * The report as a spreadsheet: one row per person, one column per metric.
 *
 * Gridlines on every cell, a frozen header row and frozen Name and Team
 * columns — the same reading aids a spreadsheet gives, which is what makes a
 * grid this wide usable at all. Twenty-eight metrics is far past what fits on
 * a screen, so the sheet scrolls sideways under fixed labels rather than
 * shrinking the text until nobody can read it.
 */

/** Fixed so the frozen columns can be offset by exactly this much. */
const NAME_W = 190;
const TEAM_W = 140;
const METRIC_W = 190;

/**
 * Borders per cell rather than `border-collapse: collapse`: with collapse,
 * browsers ignore `z-index` on cells, so the frozen columns let the metric
 * columns scroll visibly through them.
 */
const cell =
  "border-line border-r border-b px-3 py-2 align-middle whitespace-nowrap text-[12.5px]";

/**
 * Sticky cells must be opaque or the columns scrolling beneath show through
 * them, and they must out-rank those columns. Both inline, so neither depends
 * on a utility class being present in the stylesheet.
 */
const frozen = (left: number, width: number, z: number, background: string) => ({
  position: "sticky" as const,
  left,
  zIndex: z,
  background,
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
              style={{
                ...frozen(0, NAME_W, 40, "var(--color-surface-2)"),
                top: 0,
              }}
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
              style={{
                ...frozen(NAME_W, TEAM_W, 40, "var(--color-surface-2)"),
                top: 0,
              }}
            >
              Team
            </th>
            {report.metrics.map((metric) => (
              <th
                key={metric.metricId}
                scope="col"
                className={`${cell} align-bottom`}
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  background: "var(--color-surface-2)",
                  width: METRIC_W,
                  minWidth: METRIC_W,
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
                  style={frozen(0, NAME_W, 10, "var(--color-card)")}
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
                  style={frozen(NAME_W, TEAM_W, 10, "var(--color-card)")}
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
