"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export type ReportFilterOption = {
  id: string;
  name: string;
  color?: string;
};

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: ReportFilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedOptions = options.filter((option) => selected.includes(option.id));
  const buttonLabel =
    selectedOptions.length === 0
      ? allLabel
      : selectedOptions.length === 1
        ? selectedOptions[0].name
        : `${selectedOptions.length} selected`;
  const filtered = options.filter((option) =>
    normalise(option.name).includes(normalise(query)),
  );

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  };

  return (
    <div ref={wrapper} className="relative min-w-0">
      <label className="text-ink-3 mb-1.5 block text-[10px] font-extrabold tracking-[0.14em] uppercase">
        {label}
      </label>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="border-line bg-card text-ink focus-visible:ring-primary/30 flex h-[46px] w-full cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-left text-[13px] font-bold focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        {selectedOptions.length > 0 && (
          <span className="bg-primary-tint text-primary-dark shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold">
            {selectedOptions.length}
          </span>
        )}
        <ChevronIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} filter`}
          className="border-line absolute top-[calc(100%+8px)] left-0 z-50 w-full min-w-[260px] rounded-[16px] border bg-white p-2 shadow-[0_18px_40px_-20px_rgba(15,23,32,.45)]"
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="border-line bg-card text-ink focus:border-primary focus:ring-primary/20 mb-2 h-10 w-full rounded-xl border px-3 text-[13px] font-semibold outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={() => onChange([])}
            className={clsx(
              "hover:bg-surface-2 mb-1 w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-[13px] font-bold transition-colors",
              selected.length === 0 ? "text-primary-dark" : "text-ink-2",
            )}
          >
            {allLabel}
          </button>
          <div className="border-line-2 max-h-[280px] overflow-y-auto border-t pt-1">
            {filtered.map((option) => {
              const active = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className="hover:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={active}
                    onChange={() => toggle(option.id)}
                  />
                  <span
                    aria-hidden
                    className="peer-focus-visible:ring-primary/40 grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2 peer-focus-visible:ring-2"
                    style={{
                      borderColor: active
                        ? (option.color ?? "var(--color-primary)")
                        : "var(--color-line)",
                      background: active
                        ? (option.color ?? "var(--color-primary)")
                        : "#FFFFFF",
                    }}
                  >
                    {active && <CheckIcon />}
                  </span>
                  {option.color && (
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: option.color }}
                    />
                  )}
                  <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">
                    {option.name}
                  </span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-ink-3 px-3 py-2 text-[12.5px] font-semibold">
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Across the metrics currently in view. */
export type ReportStatus = "all" | "logged" | "not-logged";

export function ReportFilters({
  teams,
  metrics,
  selectedTeamIds,
  selectedMetricIds,
  search,
  status,
  sort,
  showTeamFilter,
}: {
  teams: ReportFilterOption[];
  metrics: ReportFilterOption[];
  selectedTeamIds: string[];
  selectedMetricIds: string[];
  search: string;
  status: ReportStatus;
  /** Carried through so changing a filter does not silently reset the sort. */
  sort?: string;
  showTeamFilter: boolean;
}) {
  const router = useRouter();
  const [teamIds, setTeamIds] = useState(selectedTeamIds);
  const [metricIds, setMetricIds] = useState(selectedMetricIds);
  const [searchText, setSearchText] = useState(search);
  const [statusValue, setStatusValue] = useState<ReportStatus>(status);
  const committedSearch = useRef(search);

  const selectedTeamKey = selectedTeamIds.join("\u0000");
  const selectedMetricKey = selectedMetricIds.join("\u0000");

  useEffect(() => {
    setTeamIds(selectedTeamIds);
  }, [selectedTeamKey, selectedTeamIds]);

  useEffect(() => {
    setMetricIds(selectedMetricIds);
  }, [selectedMetricKey, selectedMetricIds]);

  useEffect(() => {
    setSearchText(search);
    committedSearch.current = search;
  }, [search]);

  useEffect(() => {
    setStatusValue(status);
  }, [status]);

  const navigate = useCallback(
    ({
      nextTeamIds = teamIds,
      nextMetricIds = metricIds,
      nextSearch = searchText,
      nextStatus = statusValue,
    }: {
      nextTeamIds?: string[];
      nextMetricIds?: string[];
      nextSearch?: string;
      nextStatus?: ReportStatus;
    }) => {
      const params = new URLSearchParams();
      const cleanSearch = nextSearch.trim();

      if (cleanSearch) params.set("q", cleanSearch);
      nextTeamIds.forEach((id) => params.append("team", id));
      nextMetricIds.forEach((id) => params.append("metric", id));
      if (nextStatus !== "all") params.set("status", nextStatus);
      if (sort) params.set("sort", sort);

      committedSearch.current = nextSearch;
      const qs = params.toString();
      router.replace(qs ? `/report?${qs}` : "/report", { scroll: false });
    },
    [metricIds, router, searchText, sort, statusValue, teamIds],
  );

  useEffect(() => {
    if (searchText === committedSearch.current) return;
    const timeout = window.setTimeout(() => {
      navigate({ nextSearch: searchText });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [navigate, searchText]);

  const filtersActive =
    teamIds.length > 0 ||
    metricIds.length > 0 ||
    searchText.trim() !== "" ||
    statusValue !== "all";

  return (
    <div className="border-line bg-card rounded-[20px] border p-4 sm:p-5">
      <div
        className={clsx(
          "grid grid-cols-1 gap-3",
          showTeamFilter
            ? "lg:grid-cols-[minmax(150px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_auto]"
            : "lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_auto]",
        )}
      >
        {showTeamFilter && (
          <MultiSelect
            label="Teams"
            allLabel="All teams"
            options={teams}
            selected={teamIds}
            onChange={(ids) => {
              setTeamIds(ids);
              navigate({ nextTeamIds: ids });
            }}
          />
        )}

        <div className="min-w-0">
          <label className="text-ink-3 mb-1.5 block text-[10px] font-extrabold tracking-[0.14em] uppercase">
            Search
          </label>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search people"
            className="border-line bg-card text-ink focus:border-primary focus:ring-primary/20 h-[46px] w-full rounded-xl border px-3.5 text-[13px] font-semibold outline-none focus:ring-2"
          />
        </div>

        <MultiSelect
          label="Metrics"
          allLabel="All metrics"
          options={metrics}
          selected={metricIds}
          onChange={(ids) => {
            setMetricIds(ids);
            navigate({ nextMetricIds: ids });
          }}
        />

        <div className="min-w-0">
          <label
            htmlFor="report-status"
            className="text-ink-3 mb-1.5 block text-[10px] font-extrabold tracking-[0.14em] uppercase"
          >
            Status
          </label>
          <select
            id="report-status"
            value={statusValue}
            onChange={(event) => {
              const next = event.target.value as ReportStatus;
              setStatusValue(next);
              navigate({ nextStatus: next });
            }}
            className="border-line bg-card text-ink focus:border-primary focus:ring-primary/20 h-[46px] w-full rounded-xl border px-3.5 text-[13px] font-bold outline-none focus:ring-2"
          >
            <option value="all">Everyone</option>
            <option value="logged">Logged</option>
            <option value="not-logged">Not logged</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            disabled={!filtersActive}
            onClick={() => {
              setTeamIds([]);
              setMetricIds([]);
              setSearchText("");
              setStatusValue("all");
              navigate({
                nextTeamIds: [],
                nextMetricIds: [],
                nextSearch: "",
                nextStatus: "all",
              });
            }}
            className="border-line text-ink-2 hover:bg-surface-2 h-[46px] w-full cursor-pointer rounded-xl border bg-white px-4 text-[11.5px] font-extrabold tracking-[0.06em] uppercase disabled:cursor-default disabled:opacity-50 lg:w-auto"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
