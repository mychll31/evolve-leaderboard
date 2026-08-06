# Core+ Season 1

An accountability platform for the E-VOLVE Core+ program, themed as a basketball season.
Members belong to teams, teams have coaches, and everyone is scored on **admin-configured
metrics** — attendance and assignments are simply the first two.

Built from the Claude Design files in `design/`.

## Status — Builds 1 and 2 of 3

| Build | Contents | State |
|---|---|---|
| **1** | Schema, Google OAuth + RBAC, seed data, all seven screens on real data, attendance write path | **Done** |
| **2** | Season lifecycle, session calendar, team/people/metric CRUD, per-member score entry, CSV import & export | **Done** |
| 3 | Badge/MVP award engines, Hall of Fame history, Analytics, notifications | Not started |

Core+ no longer depends on seed data: an admin can open a season, define its calendar, build
its teams, add its people, configure its metrics and record every result from the UI.

Specs: `docs/superpowers/specs/2026-08-06-core-plus-build-{1,2}-design.md`
Plan: `docs/superpowers/plans/2026-08-06-core-plus-build-1.md`

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Drizzle ORM ·
`@libsql/client` → Turso · Auth.js v5 · Vitest

## Getting started

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

**Local development needs no Turso account.** The same `@libsql/client` driver serves a
plain `file:./local.db`, so `TURSO_DATABASE_URL="file:./local.db"` works out of the box and
`TURSO_AUTH_TOKEN` stays empty.

### Signing in locally

Core+ is invite-only — there is no public signup, and Google OAuth needs credentials. To
click through the app before setting that up, put a seeded address in `.env`:

```
AUTH_DEV_EMAIL="admin@core.example"
```

This bypass is double-guarded: it does nothing unless the build is a development build
**and** the variable is set, and it only impersonates a user who already exists in the
database. It is inert in any production build.

To use real Google sign-in, create OAuth credentials with redirect URI
`http://localhost:3000/api/auth/callback/google`, then set `AUTH_SECRET` (`npx auth secret`),
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, and clear `AUTH_DEV_EMAIL`.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Vitest suite (184 tests) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load the fixture |
| `npm run db:reset` | Drop, migrate and reseed |

## How it fits together

```
src/domain/      Pure TypeScript — scoring, ranking, streaks. No I/O, no imports from db/.
src/db/queries/  The only place SQL lives. Returns view models shaped for each screen.
src/db/mutations/ Writes, each authorising against an explicit Actor before touching data.
src/app/actions/ Thin Server Action wrappers: resolve the session, revalidate paths.
src/components/  Presentation. Server Components by default; client only where state lives.
```

Two rules hold the design together:

**`src/domain` never performs I/O.** Scoring, ranking and streak counting are pure functions
over plain records, so the logic most likely to be wrong is the cheapest to test — and it is
structurally impossible to issue a query inside a scoring loop.

**Authorisation lives in the mutation layer, not the action wrapper.** Every write takes an
explicit `Actor` and resolves permissions by querying the target's team. This is why the RBAC
tests can prove a coach cannot touch another team's member without simulating a request.

### Scoring

Four stages, in `src/domain/scoring`:

1. **Aggregate** approved entries per metric — attendance folds to present ÷ *held meetings*,
   so a missing entry counts against you rather than shrinking the denominator.
2. **Normalise** to 0–100 using each metric's `target`. Seven assignments against a target of
   eight is 87.5. Without a target, "Assignments: 7" cannot be weighed against "Attendance: 93%".
3. **Combine** under the season formula — weighted, points, or average.
4. **Rank** with competition ranking, so tied scores share a rank (1, 2, 2, 4).

The single table behind all of it is `metric_entries`, keyed by
`(membership, metric, meeting)`. Attendance is `value: 1` against a meeting; an assignment is
`value: 7` with no meeting; a coach's manual score is `value: 8` out of ten. **Adding a new
KPI is an admin action, not a migration** — which is the whole point.

Two behaviours worth knowing:

- **Lateness is derived, never stored** — `recordedAt` against `startsAt + lateAfterMinutes`.
  A late member is present but flagged, and the grace period can change retroactively.
- **A pending check-in neither counts nor breaks a streak.** Pending means the coach has not
  decided yet; a member should not lose a thirty-session streak because approval was late.

### Administration

The admin area (`/admin`) is super-admin only and covers seasons, the session calendar, teams,
people, metrics and CSV import. A few rules are enforced in the mutation layer rather than the
UI, so they hold however they are reached:

- **Locking a season is a write barrier, not a visibility change.** Locked and archived
  seasons stay fully readable; every mutation refuses them. Activating a season locks whichever
  was active, so there is always exactly one.
- **Cloning copies structure, never results** — teams, metrics and coach assignments carry
  over; members, entries, snapshots and badges do not.
- **New metrics start at weight 0**, so creating one cannot drop every score at once before a
  single value exists behind it. Under `points` or `average` — which ignore weights — the
  builder warns instead, because there the problem is real.
- **A metric's type freezes once it has entries.** `value` is a bare `REAL` whose meaning comes
  from the type, so a change would silently reinterpret history. `target` stays editable.
- **Metrics soft-delete.** A row delete would cascade their entries away.
- **CSV import previews before it writes**, and refuses the whole file if any row is invalid —
  a half-applied import is worse than a refused one.

## Deploying

1. Create a Turso database and token:
   ```bash
   turso db create core-plus
   turso db tokens create core-plus
   ```
2. On Vercel set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`. Do **not** set `AUTH_DEV_EMAIL`.
3. Apply migrations against Turso: `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate`
4. Add `https://<your-domain>/api/auth/callback/google` as an authorised redirect URI.

`better-sqlite3` is not an option here: Vercel's filesystem is ephemeral, so a file-backed
database would lose every write on the next cold start.

## Known assumption

**"15W" on the team cards is interpreted as the number of weeks a team finished top of the
standings.** The prototype hardcodes it and the brief only says "Record: 15 Wins". If wins
mean something else in your program, `winsByTeam` in `src/db/queries/teams.ts` is the one
place to change.
