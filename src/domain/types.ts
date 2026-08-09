/**
 * Plain records the domain layer operates on.
 *
 * Nothing in `src/domain/**` may import from `src/db`, `next`, or any module
 * that performs I/O. These types are deliberately structural rather than
 * Drizzle-inferred so that scoring, ranking and streak logic can be tested
 * with literals and never needs a database.
 */

export const ENTRY_STATUSES = ["pending", "approved", "rejected"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_SOURCES = ["self", "coach", "admin", "import"] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

export const MEETING_STATUSES = ["scheduled", "held", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Legacy season formula value kept for existing season rows. */
export type Formula = "weighted" | "points" | "average";

export type Metric = {
  id: string;
  key: string;
  name: string;
};

export type Entry = {
  metricId: string;
  /** Legacy calendar rows set this; new score entries are season-level. */
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
  /** Raw aggregate before clamping, for display. */
  raw: number;
  /** Clamped 0-100 value that feeds the total average. */
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
