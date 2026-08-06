# Core+ Season 1 — Build 2 Design

- **Date:** 2026-08-06
- **Status:** Approved scope, in implementation
- **Scope:** Build 2 of 3 — the app stops depending on seed data

Build 1 delivered a working read path plus attendance. Everything else still comes from
`seed.ts`. Build 2 makes Core+ operable: an admin can open a season, define its calendar,
build its teams, add its people, configure its metrics, and record every metric — without
touching a script.

Architecture is unchanged from Build 1 and is not restated here. Same layering: pure
`src/domain`, SQL confined to `src/db/queries`, writes in `src/db/mutations` taking an
explicit `Actor`, thin Server Actions on top.

## 1. Scope

| Area | Delivered |
|---|---|
| Seasons | Create, edit, lifecycle (draft → active → locked → archived), clone |
| **Session calendar** | Generate from a recurrence rule; add, retime, cancel, mark held |
| Teams | Create, rename, colour, abbreviation, order; assign and replace coach |
| People | Create users, assign to a team with a position, deactivate, archive |
| Metrics | Create, edit, reorder, soft-delete (weights and formula shipped in Build 1) |
| Score entry | **Per-member detail page** with full history, editing and audit trail |
| CSV | Import members with a preview step; export the roster with scores |

**The session calendar was not in the original Build 2 list.** It belongs here regardless:
attendance denominators, streaks, the heatmap and weekly snapshots all derive from
`meetings`, and Build 1 provides no way to create one. Without it no real season can start.

Deferred to Build 3 unchanged: badge/MVP award engines, Hall of Fame history, Analytics,
notifications.

## 2. Decisions

### Season lock is a write barrier, not a visibility change

`locked` and `archived` seasons stay fully readable — leaderboards, cards and history all
render. Every mutation calls `assertSeasonWritable`, which rejects writes against them. This
is the point of locking: freeze the result, keep the record.

Exactly one season may be `active` at a time. Activating a season demotes any current one to
`locked`, in the same transaction as the activation.

### Cloning copies structure, never results

A cloned season carries teams (name, abbr, colour, order), metrics (type, weight, target,
required) and coach assignments. It does **not** carry member memberships, entries,
snapshots or badges. Rosters change between seasons and silently importing last season's
would be worse than typing them again. Member carry-over is an explicit, separate action.

### New metrics start at weight 0

Adding a metric mid-season to a `weighted` formula would otherwise dilute every score the
instant it is created, with nobody yet holding an entry for it — everyone drops together for
no reason they can see. Weight 0 contributes nothing until an admin deliberately raises it.

In `points` and `average` mode weights are ignored, so a new empty metric *does* immediately
drag every score down. The builder warns explicitly when creating a metric under those
formulas rather than pretending the problem does not exist.

### Metric type is immutable once entries exist

`value` is a bare `REAL` whose meaning comes from the metric's type — 1/0 for a boolean, a
count for an integer, 1-10 for a manual score. Changing the type would silently reinterpret
history. The type selector locks as soon as the first entry lands. `target` stays editable,
because rescaling is a legitimate correction.

### Metrics soft-delete

`active = false` rather than a row delete: entries reference metrics, and a hard delete would
cascade away real history. Inactive metrics drop out of scoring and every screen, and their
entries stop counting.

### Coaching and playing are mutually exclusive within a season

`UNIQUE(season_id, user_id)` from Build 1 already enforces one membership per person per
season. Replacing a coach therefore deactivates the outgoing membership rather than deleting
it, preserving the history the brief asks for. Re-adding someone who previously held a
membership reactivates that row instead of inserting a colliding one.

### CSV import previews before it writes

Two steps: parse and validate into a per-row report, then apply on confirmation. An import
that half-succeeds and leaves an admin guessing which rows landed is worse than one that
refuses. Rows are matched on email; a known email updates, an unknown one creates.

```csv
name,email,team,position,role
Michael,michael@example.com,Founders,PG,member
John Doe,john@example.com,Founders,,coach
```

`team` matches on name, case-insensitively. `role` defaults to `member`. `position` is
optional. Unknown teams, malformed emails and duplicate rows are reported as errors against
their row number, and the whole import is refused if any row is invalid.

Parsing lives in `src/lib/csv.ts` as pure functions, so quoting, embedded commas, BOMs and
CRLF are unit-tested without a database.

### The member detail page is where scores are entered

One page per membership, at `/members/[id]`:

- **Season-level metrics** (assignment, quiz, manual scores) — one editable value each.
- **Attendance** — every session with its status, source and timestamps, individually
  overridable.
- **Audit trail** — who recorded, who decided, when, and whether it came from a self
  check-in, a coach, an admin or an import. Every field already exists on `metric_entries`
  and has had nowhere to surface until now.

Access: members read their own page; coaches read and write for their team; super admins
read and write for anyone. Enforced by the Build 1 `canManageMembership` scoping.

## 3. New modules

```
src/db/mutations/   seasons · meetings · teams · people · metrics · entries
src/db/queries/     admin (list views) · member (detail view model)
src/lib/csv.ts      pure parse and serialise
src/app/(app)/admin/{seasons,calendar,teams,people,import}/page.tsx
src/app/(app)/members/[id]/page.tsx
```

`src/app/(app)/admin/page.tsx` gains metric CRUD alongside the Build 1 weight steppers, and
the admin area gains sub-navigation.

## 4. Testing

Same posture as Build 1 — the risky logic is pure or data-layer, and both are testable
without a request:

- **CSV parsing** — quoted fields containing commas, CRLF, BOM, missing columns, blank
  trailing lines, duplicate emails, unknown teams.
- **Lifecycle invariants** — only one active season; writes rejected on locked and archived
  seasons; clone copies structure and no results.
- **Authorisation** — a coach editing another team's member is refused at the mutation layer,
  for every new mutation, not only attendance.
- **Metric safety** — type immutable once entries exist; soft-delete removes a metric from
  scoring without deleting entries; new metrics default to weight 0.
