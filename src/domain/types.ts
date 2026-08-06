/**
 * Plain records the domain layer operates on.
 *
 * Nothing in `src/domain/**` may import from `src/db`, `next`, or any module
 * that performs I/O. These types are deliberately structural rather than
 * Drizzle-inferred so that scoring, ranking and streak logic can be tested
 * with literals and never needs a database.
 */

export const METRIC_TYPES = [
  "percentage",
  "integer",
  "decimal",
  "boolean",
  "manual_score",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const FORMULAS = ["weighted", "points", "average"] as const;
export type Formula = (typeof FORMULAS)[number];

export const ENTRY_STATUSES = ["pending", "approved", "rejected"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_SOURCES = ["self", "coach", "admin", "import"] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

export const MEETING_STATUSES = ["scheduled", "held", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export type Metric = {
  id: string;
  key: string;
  name: string;
  type: MetricType;
  /** Relative weight in `weighted` mode. Ignored by `points` and `average`. */
  weight: number;
  /**
   * Scale used to normalise `integer` and `decimal` metrics to 0-100.
   * Required for those two types, ignored for the rest. A null or zero
   * target normalises to 0 rather than dividing by zero.
   */
  target: number | null;
};

export type Entry = {
  metricId: string;
  /** Set for metrics recorded per session (attendance); null otherwise. */
  meetingId: string | null;
  value: number;
  status: EntryStatus;
};

export type Meeting = {
  id: string;
  /** `YYYY-MM-DD`, sortable as a string. */
  meetsOn: string;
  status: MeetingStatus;
};

export type ScoreBreakdownPart = {
  metric: Metric;
  /** Raw aggregate before normalisation, for display. */
  raw: number;
  /** Normalised 0-100 value that actually feeds the formula. */
  value: number;
};

export type RankableMember = {
  membershipId: string;
  score: number;
  /** First tie-break: normalised attendance, 0-100. */
  attendance: number;
  /** Final tie-break, so ranking is deterministic. */
  name: string;
};

export type RankedMember = RankableMember & { rank: number };
