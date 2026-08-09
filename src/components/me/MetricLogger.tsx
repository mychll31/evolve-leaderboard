"use client";

import clsx from "clsx";
import { Banner, useAction } from "@/components/admin/controls";
import { logOwnEntryAction } from "@/app/actions/entries";
import type { SelfLogRow } from "@/db/queries/member";

/**
 * The member's own logging surface.
 *
 * Logging is a fact, not a grade: a metric is done or it is not, and each one
 * carries an equal share of the total — three of three logged is 100%.
 *
 * A value a Leader recorded is theirs: those metrics render locked rather than
 * failing on save.
 */

const stroke = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Glyphs for the seeded metrics, with a neutral fallback for custom ones. */
const glyphs: Record<string, React.ReactNode> = {
  attendance: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
      <path d="M9 14.5l2 2 4-4" />
    </>
  ),
  assignment: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.9.8-.9 1.4v.4" />
      <path d="M12 17.2h.01" />
    </>
  ),
  default: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
};

function MetricIcon({
  metricKey,
  logged,
}: {
  metricKey: string;
  logged: boolean;
}) {
  return (
    <span
      className={clsx(
        "flex size-12 shrink-0 items-center justify-center rounded-full",
        logged ? "bg-positive" : "bg-primary",
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        stroke="#FFFFFF"
        {...stroke}
        aria-hidden
      >
        {logged ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : (glyphs[metricKey] ?? glyphs.default)}
      </svg>
    </span>
  );
}

function MetricCard({
  row,
  pending,
  onToggle,
}: {
  row: SelfLogRow;
  pending: boolean;
  onToggle: (logged: boolean) => void;
}) {
  const disabled = pending || row.locked;
  // One plain line, not a restatement of the name: an item called "Week 1 ·
  // Attend the August 7 session" was getting "Log your week 1 · attend the
  // august 7 session" underneath it.
  const blurb = row.locked
    ? "Your leader ticked this one"
    : row.logged
      ? "Done — nice work"
      : "Tap when you've done this";

  return (
    <button
      type="button"
      aria-pressed={row.logged}
      disabled={disabled}
      onClick={() => onToggle(!row.logged)}
      className={clsx(
        "border-line bg-card flex w-full items-center gap-4 rounded-[18px] border px-5 py-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        disabled
          ? "cursor-default opacity-70"
          : "cursor-pointer hover:border-primary hover:bg-primary-tint",
        row.logged && "border-positive-line bg-positive-tint",
      )}
    >
      <MetricIcon metricKey={row.key} logged={row.logged} />

      <div className="min-w-0 flex-1">
        <div className="font-display text-ink text-[21px] leading-none font-bold">
          {row.name}
        </div>
        <div className="text-ink-3 mt-1.5 text-[12.5px] font-semibold">
          {blurb}
        </div>
      </div>
    </button>
  );
}

export function MetricLogger({
  membershipId,
  rows,
}: {
  membershipId: string;
  rows: SelfLogRow[];
}) {
  const { pending, error, success, act } = useAction();
  const done = rows.filter((row) => row.logged).length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink text-[12.5px] font-extrabold tracking-[0.14em] uppercase">
          Your list
        </h2>
        {rows.length > 0 && (
          <span className="text-ink-3 text-[12px] font-bold">
            {done} of {rows.length} done
          </span>
        )}
      </div>
      <p className="text-ink-3 mt-1.5 text-[12.5px] font-semibold">
        Tap each thing when you finish it. They all count the same, so
        finishing all {rows.length || "of them"} puts you at 100%.
      </p>

      {(error || success) && (
        <div className="mt-3">
          <Banner tone={error ? "error" : "success"}>{error ?? success}</Banner>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3.5">
        {rows.map((row) => (
          <MetricCard
            key={row.metricId}
            row={row}
            pending={pending}
            onToggle={(logged) =>
              act(() => logOwnEntryAction(membershipId, row.metricId, logged), {
                successMessage: logged
                  ? `Nice! "${row.name}" is done.`
                  : `"${row.name}" is back on your list.`,
              })
            }
          />
        ))}
        {rows.length === 0 && (
          <div className="border-line bg-card text-ink-2 rounded-[18px] border p-5 text-[13.5px] font-semibold">
            Nothing to do yet — your leader will add things here.
          </div>
        )}
      </div>
    </section>
  );
}
