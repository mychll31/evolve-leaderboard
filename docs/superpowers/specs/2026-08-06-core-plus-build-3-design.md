# Core+ Season 1 — Build 3 Design

- **Date:** 2026-08-06
- **Status:** Approved scope, in implementation
- **Scope:** Build 3 of 3 — the gamification layer becomes real

Builds 1 and 2 made Core+ operable. Build 3 makes it *motivating*: badges are earned rather
than seeded, weekly MVPs are chosen, history accumulates across seasons, and people are told
when something happens to them.

Architecture unchanged. Same layering: pure `src/domain`, SQL in `src/db/queries`, writes in
`src/db/mutations` taking an explicit `Actor`, thin Server Actions on top.

## 1. The gap this closes

**Only `seed.ts` writes `score_snapshots` and `member_badges` today.** Nothing in the running
application does. In a live season that means the ▲/▼ delta arrows freeze at seed time and
stay frozen, and no member ever earns a badge after the initial fixture. `badges.ruleJson` has
existed since Build 1 and has never been read.

Everything below hangs off fixing that.

## 2. Scope

| Area | Delivered |
|---|---|
| Weekly rollup | Idempotent routine writing snapshots, awarding badges, picking MVPs, raising notifications |
| Badge engine | Parameterised rules in `ruleJson`, evaluated by pure functions; admin rule builder |
| MVP system | Weekly awards: overall, best-in-each-metric, most improved, plus coach's choice |
| Hall of Fame | Real cross-season history, not just the current standings |
| Analytics | Season trends, per-metric trends, rank movement, activity heatmap, biggest movers |
| Notifications | In-app centre with unread counts |

## 3. New tables

```
weekly_awards   id, seasonId, weekNo, category, membershipId, teamId?, value, note, createdAt
                UNIQUE(seasonId, weekNo, category, teamId)

notifications   id, userId, seasonId?, kind, title, body, link?, readAt?, createdAt,
                channel ('in_app'), deliveredAt?
```

`weekly_awards.teamId` is null for season-wide categories and set for `coach_choice`, which is
one nomination *per team per week*. That is what the composite unique key encodes.

`channel` and `deliveredAt` exist now, unused beyond `in_app`, so email delivery can be added
later without a migration.

## 4. Badge rules

Five parameterised rule types, stored as JSON in the existing `badges.ruleJson`:

```jsonc
{ "type": "streak",               "threshold": 5 }
{ "type": "metric_at_least",      "metricKey": "attendance", "value": 100 }
{ "type": "all_metrics_at_least", "value": 100 }
{ "type": "rank_at_most",         "value": 1 }
{ "type": "most_improved" }
{ "type": "has_any_entry",        "metricKey": "assignment" }
```

Each is a small pure predicate over a `BadgeContext` (streak, normalised breakdown, rank,
delta, which metrics have values). No expression language: a parser plus sandbox would turn
every admin typo into a silently un-awarded badge, and nobody running an accountability
programme wants to debug an expression.

**Awards are permanent.** Once earned, a badge is not revoked when the condition lapses —
`member_badges` is an achievement log, not a live view. `UNIQUE(membershipId, badgeId)` makes
re-running the rollup idempotent.

A badge with no rule, or an unrecognised rule type, is simply never awarded automatically. It
stays displayable and manually grantable rather than crashing the rollup.

## 5. Weekly rollup

One routine, `runWeeklyRollup(db, seasonId, now)`, doing five things in order:

1. **Snapshot** — compute standings, upsert `score_snapshots` for the current week, carrying
   the previous week's rank into `prevRank`.
2. **Badges** — evaluate every active badge rule against every member; insert awards that do
   not already exist.
3. **MVPs** — pick `overall`, `metric:<key>` for each active metric, and `most_improved`
   (largest rank gain against last week's snapshot). Upserted, so a re-run settles rather than
   duplicates.
4. **Notifications** — one per badge earned and per MVP won, plus a nudge to any member with a
   required metric still unrecorded.
5. Return counts, so both callers can report what happened.

**Idempotent by construction.** Re-running a week overwrites its snapshot and awards and skips
badges already held, so a duplicated cron, a manual re-run, or a retry after a failure all
converge on the same state. This matters more than transactionality here: Turso is libSQL over
HTTP, and a rollup that is safe to simply run again is worth more than one that is atomic.

Two entry points:

- **Admin button** in the console — a manual lever, and how you backfill.
- **`GET /api/cron/rollup`**, guarded by a `CRON_SECRET` bearer token, for Vercel Cron.
  Without the secret set the route refuses outright rather than running unauthenticated.

## 6. Screens

| Route | Contents |
|---|---|
| `/analytics` | Attendance and per-metric trends, rank movement, activity heatmap, biggest movers |
| `/notifications` | In-app centre, unread first, mark read / mark all read |
| `/hall-of-fame` | Rewritten: cross-season legends, MVP roll, badge cabinet |
| `/admin/badges` | Badge CRUD with the parameterised rule builder |

The top bar gains a bell with an unread count. `/coach` gains a coach's-choice nomination for
the current week.

## 7. Seed

The Hall of Fame is meaningless with one season, so the seed gains a **completed, archived
"Core+ Preseason"** — its own teams, members, final snapshots, MVP awards and badges. That
gives cross-season history something real to show and gives the queries something to be tested
against.

Existing badges gain rules, so the rollup has something to evaluate on first run.

## 8. Testing

- **Rule evaluation** — every rule type, boundary values, missing metric, unknown rule type,
  malformed JSON.
- **Idempotency** — running the rollup twice produces identical snapshots, awards and badge
  counts, and raises no duplicate notifications.
- **MVP selection** — ties, a week with no prior snapshot (most-improved undefined), a season
  with a single member.
- **Cron authorisation** — missing, wrong and absent-secret cases all refuse.
- **Notification scoping** — a member sees only their own.
