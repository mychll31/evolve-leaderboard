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

/** Mirrors the seeded metrics; anything an admin adds gets a generic line. */
const blurbs: Record<string, string> = {
  attendance: "Log your attendance",
  assignment: "Submit your assignments",
  quiz: "Complete weekly quizzes",
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

/**
 * The one control on the row. A real checkbox rather than a styled button, so
 * it keeps native keyboard and screen-reader behaviour for free.
 */
function LogCheckbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={clsx(
        "shrink-0",
        disabled ? "cursor-default" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={clsx(
          "peer-focus-visible:ring-primary/40 grid size-9 place-items-center rounded-[10px] border-2 transition-colors peer-focus-visible:ring-2",
          checked
            ? "border-positive bg-positive"
            : "border-line bg-white hover:border-primary",
          disabled && "opacity-45",
        )}
      >
        {checked && (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            stroke="#FFFFFF"
            {...stroke}
            aria-hidden
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
    </label>
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
  const value = row.value ?? 0;
  const blurb = blurbs[row.key] ?? `Log your ${row.name.toLowerCase()}`;

  return (
    <div className="border-line bg-card flex flex-wrap items-center gap-4 rounded-[18px] border px-5 py-4">
      <MetricIcon metricKey={row.key} logged={row.logged} />

      <div className="min-w-0 flex-1">
        <div className="font-display text-ink text-[21px] leading-none font-bold">
          {row.name}
        </div>
        <div className="text-ink-3 mt-1.5 text-[12.5px] font-semibold">
          {blurb}
        </div>
      </div>

      <div className="text-right">
        <div
          className={clsx(
            "text-[13px] font-extrabold tracking-[0.06em] uppercase",
            row.locked
              ? "text-ink-3"
              : row.logged
                ? "text-positive"
                : "text-ink-4",
          )}
        >
          {row.locked ? "Leader set" : row.logged ? "Done" : "Not yet"}
        </div>
        <div className="text-ink-3 mt-1 text-[11.5px] font-semibold">
          {row.locked
            ? `Set by ${row.recordedByName ?? "your Leader"} · ${Math.round(value)}%`
            : row.logged
              ? "Counts in full"
              : "Worth 0 so far"}
        </div>
      </div>

      <LogCheckbox
        label={`${row.name} done`}
        checked={row.logged}
        disabled={pending || row.locked}
        onChange={onToggle}
      />
    </div>
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
          Your metrics
        </h2>
        {rows.length > 0 && (
          <span className="text-ink-3 text-[12px] font-bold">
            {done} of {rows.length} logged
          </span>
        )}
      </div>
      <p className="text-ink-3 mt-1.5 text-[12.5px] font-semibold">
        Tap each one as you do it. Every metric counts equally, so all{" "}
        {rows.length || "of them"} logged is 100%.
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
                  ? `${row.name} logged — it counts toward your score now.`
                  : `${row.name} un-logged.`,
              })
            }
          />
        ))}
        {rows.length === 0 && (
          <div className="border-line bg-card text-ink-2 rounded-[18px] border p-5 text-[13.5px] font-semibold">
            No metrics are being tracked this season yet.
          </div>
        )}
      </div>
    </section>
  );
}
