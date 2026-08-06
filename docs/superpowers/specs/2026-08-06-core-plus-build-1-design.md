# Core+ Season 1 — Build 1 Design

- **Date:** 2026-08-06
- **Status:** Approved design, pending implementation plan
- **Scope:** Build 1 of 3

## 1. Context

Core+ is an accountability platform for the E-VOLVE program, themed as a basketball season.
Members belong to teams, teams have coaches, and everyone is scored on admin-configured
metrics. The scoreboard — not the admin panel — is the centre of the product.

Two Claude Design files define the UI:

- `design/Core+ Web App.dc.html` — desktop, 1440×900, sidebar shell, six screens.
- `design/Core+ Season App.dc.html` — phone, bottom nav, adds **My Card** and **Analytics**.

Both are prototypes: one in-memory `Component` class, flat `att`/`asn`/`quiz` numbers per
player, no persistence, no auth. They define look and interaction, not architecture.

### Program shape (confirmed with the product owner)

| Question | Decision |
|---|---|
| Session cadence | Admin-defined calendar of session dates per season |
| Who records attendance | Members self-check-in **and** coaches record/override on their behalf |
| Authentication | Google OAuth, admin pre-authorises addresses, no public signup |
| Deployment | Vercel + Turso (libSQL) |
| Responsiveness | Full — phone through desktop |

### The three builds

| Build | Contents |
|---|---|
| **1 (this spec)** | Schema, auth + RBAC, seed data, all screens on real data, **attendance write path** |
| 2 | Admin CRUD (seasons, teams, users, metrics, formula), assignment/quiz entry, CSV import |
| 3 | Badge/MVP **award** engines, Hall of Fame history, Analytics, notifications |

Note: streak *calculation* is Build 1 — the 🔥 counts appear on the dashboard, leaderboard and
player card. What Build 3 adds is the engine that *awards badges* off the back of those streaks.

Build 1 is deliberately a complete loop rather than a set of screens: a member checks in, a
coach approves, the leaderboard moves. Everything else stays seeded until Build 2.

## 2. Architecture

Next.js 15 App Router · TypeScript strict · Tailwind · Drizzle ORM · `@libsql/client` → Turso ·
Auth.js v5 · Vercel.

```
src/
  app/
    (auth)/signin
    (app)/dashboard | leaderboard | teams | me | coach | admin | hall-of-fame
    api/auth/[...nextauth]/route.ts
  domain/          scoring/ · streaks/ · ranking/     ← pure TypeScript, zero I/O
  db/              schema/ · queries/ · seed.ts · client.ts
  lib/auth/        config.ts · guards.ts · scoping.ts
  components/      ui/ · shell/ · dashboard/ · leaderboard/ · teams/ · coach/ · admin/ · me/
tests/
  domain/          scoring · streaks · ranking
  db/              queries against a local libSQL file
```

### Why this stack

- **`better-sqlite3` is unusable here.** It is a native module backed by a local file;
  Vercel's serverless filesystem is ephemeral, so every write would be silently lost on the
  next cold start. Turso speaks libSQL over HTTP, which is what a serverless function needs.
- **Drizzle over Prisma** — no runtime query engine, so no cold-start penalty, and
  `drizzle-orm/libsql` is a first-class driver rather than an adapter shim.
- **Auth.js with a database adapter uses database sessions**, so `users.role` is read per
  request. Demoting an admin takes effect immediately instead of whenever a JWT expires.

### Layering rule

`domain/` contains no imports from `db/`, `app/`, or any library with I/O. Scoring, streaks and
ranking are pure functions over plain records. This makes the parts most likely to be wrong the
parts cheapest to test, and makes it structurally impossible to issue a query from inside a
scoring loop.

Server Components read through `db/queries/*`, which return view models already shaped for the
screens. **Turso is a network hop, so N+1 access is far more expensive than against a local
file.** Every screen gets a bounded number of aggregate queries; no per-player lookups.

## 3. Data model

Auth.js owns `users`, `accounts`, `sessions`, `verification_tokens` (standard Drizzle adapter
schema), with `users.role` added: `super_admin` | `user`.

### Domain tables

```
seasons        id, name, starts_on, ends_on, status(draft|active|locked|archived),
               formula(weighted|points|average), created_at

teams          id, season_id, name, abbr, color, sort_order

memberships    id, season_id, team_id, user_id, role(coach|member),
               position, joined_at, active
               UNIQUE(season_id, user_id)   -- one team per person per season

meetings       id, season_id, meets_on, starts_at, late_after_minutes,
               label, status(scheduled|held|cancelled)

metrics        id, season_id, key, name,
               type(percentage|integer|decimal|boolean|manual_score),
               weight, target, required, sort_order, active

metric_entries id, season_id, metric_id, membership_id, meeting_id?,
               value REAL,
               status(pending|approved|rejected),
               source(self|coach|admin|import),
               recorded_by, recorded_at, decided_by, decided_at, note

score_snapshots id, season_id, membership_id, week_no, score, rank, prev_rank,
                breakdown_json, computed_at
                UNIQUE(season_id, membership_id, week_no)

badges         id, season_id?, key, icon, name, requirement_text, rule_json, active
member_badges  id, membership_id, badge_id, season_id, awarded_at
```

### Three decisions that carry the design

**Roles are split across two places.** `users.role` is global and only distinguishes
`super_admin`. Coach-ness is *per season*, expressed as a `memberships` row with
`role = 'coach'`. Coaching Founders in Season 1 and Titans in Season 2 is therefore two rows,
and the brief's "Coaches: assign, replace, multiple seasons, history" requirement needs no
extra machinery. A membership is also the unit every score, entry and badge hangs off, so
season isolation is automatic — nothing leaks between seasons.

`UNIQUE(season_id, user_id)` means **one person holds at most one team place per season** —
they cannot coach one team while playing for another in the same season. This keeps "my team"
unambiguous everywhere in the UI. Across seasons there is no constraint, so history accumulates
freely.

**`metric_entries` is one generic fact table for every metric type.** This is what makes the
metric builder genuinely dynamic instead of three hardcoded columns. Attendance is one row per
member per meeting with `value` 1 or 0; an assignment metric is a row with `value` = count;
a manual coach score is a row with `value` 1–10. Adding a "Sales" or "Mentoring" metric later
is an admin action, not a migration.

**Lateness is derived, never stored.** A member is late when
`recorded_at > meetings.starts_at + late_after_minutes`. This is what reproduces
"Checked in 9:04 AM · late" honestly — a late member is *present but flagged*, and the rule can
be changed retroactively without rewriting history. `source` is what separates a real
self-check-in from a coach filling in gaps afterwards; without it, the two are indistinguishable
and the audit trail is worthless.

`score_snapshots` exists because the ▲/▼ delta arrows and the six-week trend need a *previous*
rank. Once entries change, last week's standings are unrecoverable from current data.
`week_no = floor((date - season.starts_on) / 7) + 1` — deterministic, no ISO week edge cases.

## 4. Scoring engine

Four pure stages in `domain/scoring`, each independently testable:

1. **Aggregate** approved entries per (membership, metric).
   - `percentage` bound to meetings → approved-present ÷ eligible held meetings
   - `integer` → sum · `decimal` → mean · `boolean` → 1/0 · `manual_score` → latest
   - Only `status = 'approved'` entries count. Pending and rejected are invisible to scoring.
   - Cancelled meetings are excluded from the denominator.
2. **Normalise** to 0–100 using `metric.target`. An assignment metric with `target = 8` and 7
   submitted yields 87.5. *This is why `target` sits on the metric row*: without a scale,
   "Assignments: 7" cannot be weighed against "Attendance: 93%". `target` is **required for
   `integer` and `decimal` and ignored for the others** — `percentage` and `boolean` scale by
   100, `manual_score` by 10. A `target` of 0 or null on an `integer`/`decimal` metric
   normalises to 0 rather than dividing by zero.
   Normalised values are clamped to 0–100, so over-delivery (9 of 8 assignments) reads as 100.
3. **Combine** per `seasons.formula`:
   - `weighted` → `Σ(norm × weight) / Σweight`
   - `points` → `Σ norm` (may exceed 100 — intended)
   - `average` → `mean(norm)`
   - `Σweight = 0` yields 0, guarded rather than dividing by zero.
4. **Rank** descending, ties broken by attendance then name.

**Ranking uses competition ranking (1, 2, 2, 4), not the prototype's `index + 1`,** which
silently gives tied players different ranks.

**Streaks** (`domain/streaks`) count consecutive *held* meetings attended, walking backwards
from the most recent held meeting. An absence breaks the streak; so does a missing entry for a
held meeting. Cancelled meetings are skipped, not treated as breaks.

## 5. Screens

Every route serves both layouts from one component tree — desktop sidebar shell above
`lg`, bottom nav below, with the two-column grids stacking. No separate mobile app.

| Route | Desktop source | Notes |
|---|---|---|
| `/dashboard` | Season Dashboard | Hero, Top 5, MVP card, standings, trend, heatmap, streak |
| `/leaderboard` | Player Leaderboard | Broadcast / Podium / Stat Sheet, team + sort filters |
| `/teams` | Team Standings | Ten team cards with rollups |
| `/me` | *(from phone design)* | Flippable card, season log, **score breakdown** |
| `/coach` | Coach Desk | Counters, approve / mark-missing, top & bottom performers |
| `/admin` | Metric Builder | Weight steppers, formula toggle, live top-5 preview |
| `/hall-of-fame` | Hall of Fame | Legends + badge cabinet |

**Broadcast layout** keeps the absolutely-positioned `translateY` rows and the
`cubic-bezier(.2,.85,.25,1)` transition — the animated rank shuffle is the single most
distinctive thing in the design and survives the port intact. It is a client component;
everything else defaults to a Server Component.

**`/me` is new to the desktop app** and carries the score breakdown per metric with its weight.
If admins can reweight the formula, members must be able to see why their number moved — that
transparency is what makes the metric builder trustworthy rather than arbitrary.

**Analytics defers to Build 3.** Its trend and heatmap already appear on the dashboard; only
"Biggest Movers" is genuinely new, and it belongs with the MVP/streak engines.

### Design system

Light theme, taken from the design files rather than the brief's text.

| Token | Value |
|---|---|
| Surface / page | `#F4F7FA`, cards `#FFFFFF`, borders `#E2E8EF` |
| Ink | `#0F1720` primary, `#5B6B7C` secondary, `#93A1B0` muted |
| Primary | Teal `#12B5CB` |
| Accent | Orange `#F97316` |
| Positive / negative | `#16A34A` / `#DC2626` |
| Display type | Barlow Condensed 600–800 — ranks, scores, team names |
| Body type | Manrope 400–800 |

> The brief specifies dark NBA styling (`#111827`, `#2563EB`). **The design files disagree** —
> they are light with teal/orange. The design files win; the brief's palette is superseded.

Team colours live in `teams.color`, so the ten-colour palette is data, not code.

## 6. RBAC

Enforced in three places, because middleware alone protects routes but not data:

1. **Middleware** — unauthenticated requests redirect to `/signin`.
2. **`requireRole()` in every Server Component and Server Action** — never trust the client.
3. **Query scoping** — coach reads and writes are constrained to `membership.team_id` values
   they coach, at the query level rather than by filtering after fetch.

| Capability | Member | Coach | Super Admin |
|---|---|---|---|
| View leaderboard, teams, own card, badges | ✓ | ✓ | ✓ |
| Self check-in | ✓ | ✓ | ✓ |
| Approve / reject / override attendance | — | own team | all |
| Metric builder, season control | — | — | ✓ |

Access is granted by an `allowedEmails` check in the Auth.js `signIn` callback: an address with
no pre-created `users` row is refused sign-in. Google's `email_verified` is required.

## 7. Departures from the prototype

Each of these is a place the mock does something that would be wrong against a real database.

| Prototype | Build 1 | Why |
|---|---|---|
| `▶ RUN GAME WEEK` randomises live stats | Dev-only seed randomiser + admin "Recompute standings" | Randomising real member data is destructive |
| "VIEWING AS" role switcher in sidebar | Super-admin-only "View as" | A member clicking themselves into admin defeats RBAC entirely |
| Team points = `score × 21` | Σ of member scores | `× 21` is arbitrary and makes standings meaningless |
| `wins: 15` hardcoded | Weeks the team finished #1 | **Assumption — flagged for confirmation** |
| Rank = `index + 1` | Competition ranking | Ties must share a rank |
| "124 members · 34 days left" | Computed from data and `ends_on` | — |
| Phone frame, notch, `9:41`, `5G ▮▮▮` | Removed | Canvas furniture, not UI |
| Badges filtered by rank | Real `member_badges` rows, seeded | Award engine is Build 3 |

## 8. Testing

Vitest.

- **`domain/` first.** Pure functions, so the failure modes worth pinning down are cheap:
  zero held meetings, all-absent member, `Σweight = 0`, tied scores, cancelled meetings inside
  a streak, `target = 0`, entries for a member who left mid-season.
- **`db/queries/`** run against a **local libSQL file**, never Turso. Migrations apply to a
  temp database per suite.
- **RBAC guards** get direct tests: a coach acting on another team's membership must be
  rejected at the query layer, not merely hidden in the UI.

## 9. Environment

```
TURSO_DATABASE_URL      # file:./local.db in development
TURSO_AUTH_TOKEN        # unset in development
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
```

The same `@libsql/client` handles a local `file:` URL and a remote Turso URL, so local
development needs no Turso credentials and no separate driver.

Seed data reproduces the prototype's fixture — 10 teams, 14 members, 3 metrics
(Attendance 40 / Assignment 40 / Quiz 20), 6 weeks of meetings and entries — so every screen
has realistic data from first run.

The E-VOLVE logo moves from `design/uploads/` to `public/` and is optimised (currently 274 KB).

## 10. Open assumption

**"15W" on the team cards is defined as the number of completed weeks in which the team
finished first in the weekly team standings.** The prototype hardcodes it and the brief only
says "Record: 15 Wins". This number appears on every team card, so if wins mean something else
in your program, it should be corrected before implementation.
