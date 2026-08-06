# Leaderboard Season 1 — Build 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable Leaderboard app where a member checks in, their coach approves, and the leaderboard moves — with every screen rendering real data from Turso.

**Architecture:** A pure, I/O-free `domain/` layer (scoring, ranking, streaks) that is unit-tested without a database, sitting under a `db/queries/` read layer that returns view models already shaped for each screen. Server Components read; Server Actions write. Only the leaderboard is a client component, because its animated rank transitions need local state.

**Tech Stack:** Next.js 16.3 (App Router) · React 19 · TypeScript strict · Tailwind 4 · Drizzle ORM 0.45 · `@libsql/client` → Turso · Auth.js v5 (`next-auth@beta`) · Vitest 4

**Spec:** `docs/superpowers/specs/2026-08-06-core-plus-build-1-design.md`

## Global Constraints

- **Next.js 16 removes synchronous request APIs.** `cookies()`, `headers()`, `params`, `searchParams` MUST be awaited. Use `PageProps<'/route'>` for typed page props.
- **`src/domain/**` imports nothing with I/O** — no `db`, no `next`, no `@libsql/client`. Pure functions over plain records only.
- **Never trust the client for authorisation.** Every Server Component and Server Action calls a guard from `src/lib/auth/guards.ts`; coach data access is scoped at the query level, not filtered after fetch.
- **Turso is a network hop.** No per-row queries inside loops. Each screen gets a bounded number of aggregate queries.
- **Only `status = 'approved'` metric entries count toward scores.** Pending and rejected are invisible to scoring.
- **Palette (from the design files, superseding the brief):** surface `#F4F7FA`, card `#FFFFFF`, border `#E2E8EF`, ink `#0F1720` / `#5B6B7C` / `#93A1B0`, primary teal `#12B5CB`, accent orange `#F97316`, positive `#16A34A`, negative `#DC2626`. Display font Barlow Condensed 600–800; body Manrope 400–800.
- **Design files are the markup source of truth:** `design/Core+ Web App.dc.html` (desktop) and `design/Core+ Season App.dc.html` (phone). Strip the phone mockup's device frame, notch, `9:41` and `5G ▮▮▮ 86%` — those are canvas furniture.
- **Commit after every task.**

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/db/schema/auth.ts` | Auth.js tables: users (+`role`), accounts, sessions, verificationTokens |
| `src/db/schema/season.ts` | seasons, teams, memberships, meetings |
| `src/db/schema/metrics.ts` | metrics, metricEntries |
| `src/db/schema/progress.ts` | scoreSnapshots, badges, memberBadges |
| `src/db/client.ts` | libSQL client + Drizzle instance |
| `src/db/seed.ts` | Deterministic fixture: 10 teams, 14 members, 3 metrics, 6 weeks |
| `src/domain/types.ts` | Plain records the domain layer operates on |
| `src/domain/scoring/aggregate.ts` | Entries → raw aggregate per metric |
| `src/domain/scoring/normalize.ts` | Raw aggregate → 0–100 |
| `src/domain/scoring/combine.ts` | Normalised values + formula → final score |
| `src/domain/scoring/index.ts` | `scoreMember`, `scoreBreakdown` |
| `src/domain/ranking/index.ts` | Competition ranking with tie-breaks |
| `src/domain/streaks/index.ts` | Consecutive held-meeting attendance |
| `src/db/queries/*.ts` | One module per screen, returning view models |
| `src/lib/auth/config.ts` | Auth.js config, allowlist `signIn` callback, role on session |
| `src/lib/auth/guards.ts` | `requireUser`, `requireRole`, `requireCoachOf` |
| `src/components/shell/*` | Sidebar (desktop) + BottomNav (phone) + TopBar |
| `src/components/ui/*` | StatTile, Card, Pill, ProgressBar, Avatar, DisplayNumber |
| `src/app/(app)/*/page.tsx` | Seven screens |
| `src/app/actions/attendance.ts` | Check-in, approve, reject, override |
| `src/app/actions/metrics.ts` | Weight + formula persistence |

---

## Task 1: Project scaffold and a green test run

**Files:** Create `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `drizzle.config.ts`, `.env.example`, `src/domain/types.ts`, `tests/domain/smoke.test.ts`

**Interfaces produced:** path alias `@/*` → `src/*`; `npm run dev|build|test|db:generate|db:migrate|db:seed`

- [ ] **Step 1:** Write `tsconfig.json` (strict, `@/*` → `./src/*`, `moduleResolution: bundler`, Next plugin).
- [ ] **Step 2:** Write `vitest.config.ts` with the same `@/` alias and `environment: 'node'`.
- [ ] **Step 3:** Write `tests/domain/smoke.test.ts` asserting `1 + 1 === 2`. Run `npm test` — expect PASS. This proves the runner and alias resolve before any real logic depends on them.
- [ ] **Step 4:** Write Tailwind 4 `globals.css` with `@import "tailwindcss"` and an `@theme` block defining the palette tokens and the two font families.
- [ ] **Step 5:** Write root `layout.tsx` loading Barlow Condensed + Manrope via `next/font/google`.
- [ ] **Step 6:** Run `npm run build` — expect success.
- [ ] **Step 7:** Commit.

## Task 2: Database schema and migrations

**Files:** Create `src/db/schema/{auth,season,metrics,progress,index}.ts`, `src/db/client.ts`; Test: `tests/db/schema.test.ts`

**Interfaces produced:** all Drizzle table objects; `db` (Drizzle instance); `createDb(url)` for tests.

Schema exactly as specified in spec §3. Key column notes:
- `users.role`: `text({ enum: ['super_admin','user'] }).notNull().default('user')`
- `memberships`: `unique(seasonId, userId)`
- `meetings`: `meetsOn` (date text `YYYY-MM-DD`), `startsAt` (unix ms), `lateAfterMinutes` default 0
- `metricEntries`: `value` real; `status`/`source` text enums; `meetingId` nullable
- `scoreSnapshots`: `unique(seasonId, membershipId, weekNo)`

- [ ] **Step 1:** Write the four schema modules and barrel `index.ts`.
- [ ] **Step 2:** Write `src/db/client.ts` exporting `createDb(url, authToken?)` and a default `db` built from `TURSO_DATABASE_URL`.
- [ ] **Step 3:** Write `drizzle.config.ts` with `dialect: 'turso'`, `schema: './src/db/schema/index.ts'`, `out: './drizzle'`.
- [ ] **Step 4:** Run `npm run db:generate` — expect SQL migration files in `drizzle/`.
- [ ] **Step 5:** Write `tests/db/schema.test.ts`: migrate a temp file database, insert a season + team + membership, assert the `unique(seasonId, userId)` constraint rejects a duplicate. Run — expect PASS.
- [ ] **Step 6:** Commit.

## Task 3: Scoring engine (TDD)

**Files:** Create `src/domain/scoring/{aggregate,normalize,combine,index}.ts`; Test: `tests/domain/scoring.test.ts`

**Interfaces produced:**
```ts
type MetricType = 'percentage'|'integer'|'decimal'|'boolean'|'manual_score'
type Metric = { id:string; key:string; name:string; type:MetricType; weight:number; target:number|null }
type Entry  = { metricId:string; meetingId:string|null; value:number; status:'pending'|'approved'|'rejected' }
type Formula = 'weighted'|'points'|'average'

aggregate(metric: Metric, entries: Entry[], eligibleMeetings: number): number
normalize(metric: Metric, raw: number): number            // 0..100, clamped
combine(parts: {weight:number; value:number}[], f: Formula): number
scoreMember(metrics, entries, eligibleMeetings): number
scoreBreakdown(metrics, entries, eligibleMeetings): { metric: Metric; value: number }[]
```

- [ ] **Step 1:** Write failing tests covering: approved-only filtering; attendance 5/6 meetings → 83.3; integer 7 of target 8 → 87.5; over-delivery 9/8 → clamped 100; `target` null/0 → 0 not `Infinity`; boolean → 0/100; manual_score 8 → 80; weighted 40/40/20; `points` summing past 100; `average`; `Σweight = 0` → 0.
- [ ] **Step 2:** Run — expect FAIL (modules absent).
- [ ] **Step 3:** Implement the four modules.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit.

## Task 4: Ranking with competition ties (TDD)

**Files:** Create `src/domain/ranking/index.ts`; Test: `tests/domain/ranking.test.ts`

**Interfaces produced:** `rankMembers(rows: {membershipId:string; score:number; attendance:number; name:string}[]): {membershipId:string; rank:number}[]`

- [ ] **Step 1:** Failing tests: distinct scores → 1,2,3; a tie → `1,2,2,4` (**not** `1,2,3,4`); tie broken by higher attendance; then by name; empty input → `[]`.
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement. **Step 4:** Run — expect PASS. **Step 5:** Commit.

## Task 5: Streaks (TDD)

**Files:** Create `src/domain/streaks/index.ts`; Test: `tests/domain/streaks.test.ts`

**Interfaces produced:** `currentStreak(meetings: {id:string; meetsOn:string; status:'scheduled'|'held'|'cancelled'}[], entries: Entry[]): number`

- [ ] **Step 1:** Failing tests: all present → count of held meetings; absence breaks; **missing entry for a held meeting breaks**; cancelled meetings are skipped without breaking; a pending entry does not count as present; `scheduled` (future) meetings are ignored; no meetings → 0.
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement (walk backwards from most recent held). **Step 4:** Run — expect PASS. **Step 5:** Commit.

## Task 6: Seed data

**Files:** Create `src/db/seed.ts`; Test: `tests/db/seed.test.ts`

Reproduces the prototype fixture: 10 teams with their exact names/abbrs/colours, 14 members with positions, 3 metrics (Attendance 40 %, Assignment 40 int target 8, Quiz 20 int target 10), season Aug 1 – Sep 30, ~18 meetings (Mon/Wed/Fri over 6 weeks), attendance + assignment + quiz entries, 6 weekly `scoreSnapshots`, the 6 badges, and coach users. **Deterministic** — a seeded PRNG, never `Math.random()`, so tests and screenshots are reproducible.

- [ ] **Step 1:** Write `seed.ts` as an idempotent function taking a `db`.
- [ ] **Step 2:** Test: seed a temp database, assert 10 teams / 14 member memberships / 10 coach memberships, and that every member has an entry for every held meeting.
- [ ] **Step 3:** Run seed against `local.db` and eyeball counts. **Step 4:** Commit.

## Task 7: Auth.js v5 + RBAC guards

**Files:** Create `src/lib/auth/{config,guards,scoping}.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`, `src/app/(auth)/signin/page.tsx`; Test: `tests/db/guards.test.ts`

**Interfaces produced:**
```ts
requireUser(): Promise<SessionUser>                      // redirects to /signin
requireRole(r: 'super_admin'): Promise<SessionUser>      // 403 otherwise
requireCoachOf(membershipId: string): Promise<SessionUser>
coachTeamIds(userId, seasonId): Promise<string[]>
```

- [ ] **Step 1:** Auth.js config — Google provider, `DrizzleAdapter`, `signIn` callback rejecting any address without a pre-created `users` row **and** requiring `profile.email_verified`, `session` callback copying `user.role` onto the session.
- [ ] **Step 2:** Middleware redirecting unauthenticated requests to `/signin`.
- [ ] **Step 3:** Guards. `requireCoachOf` resolves the membership's team and asserts the caller coaches it **or** is `super_admin`.
- [ ] **Step 4:** Tests: a coach acting on another team's membership is rejected **at the query layer**; a super admin is allowed; a member is rejected.
- [ ] **Step 5:** Sign-in page (E-VOLVE logo, "Continue with Google"). **Step 6:** Commit.

## Task 8: Design tokens, UI primitives, and the responsive shell

**Files:** Create `src/components/ui/{Card,StatTile,Pill,ProgressBar,Avatar,DisplayNumber}.tsx`, `src/components/shell/{Sidebar,BottomNav,TopBar,AppShell}.tsx`, `src/app/(app)/layout.tsx`

The shell is the responsive contract for every screen: `Sidebar` at `lg:` and above, `BottomNav` below. Nav items are role-filtered from the session — Coach Desk only for coaches, Admin only for super admins — so an unauthorised link is never rendered *and* never reachable (Task 7 guards the route itself).

- [ ] **Step 1:** UI primitives, each taking explicit props, no data access.
- [ ] **Step 2:** Sidebar per the desktop design (dark `#0F1720`, logo, season name, dot indicators).
- [ ] **Step 3:** BottomNav per the phone design, with its inline SVG icons; drop the device frame.
- [ ] **Step 4:** `AppShell` composing them + `TopBar` (page title, week pill, search, super-admin "View as").
- [ ] **Step 5:** Verify at 390 px, 768 px, 1440 px. **Step 6:** Commit.

## Task 9: Query layer

**Files:** Create `src/db/queries/{season,leaderboard,teams,coach,me,fame}.ts`; Test: `tests/db/queries.test.ts`

Each function takes `(db, seasonId, …)` and returns a fully-formed view model. This is the only place SQL lives.

**Interfaces produced:** `getSeasonOverview`, `getLeaderboard`, `getTeamStandings`, `getCoachDesk`, `getMyCard`, `getHallOfFame` — each returning types exported from the same module.

- [ ] **Step 1:** `getLeaderboard` — load metrics, memberships, approved entries and meetings in **four** queries, then score/rank in the domain layer. Assert query count in a test; this is the N+1 guard.
- [ ] **Step 2:** Remaining query modules.
- [ ] **Step 3:** Tests against a seeded temp database: leaderboard length, rank 1 identity, deltas derived from snapshots, coach desk scoped to one team.
- [ ] **Step 4:** Commit.

## Task 10: Dashboard

**Files:** Create `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/*`

Hero (season name, dates, days-left **computed** from `ends_on`, member/team counts computed), Top 5 with delta arrows, MVP card with sweep animation, team standings, attendance trend (6 weekly buckets from snapshots), daily activity heatmap (14-col desktop / 7-col phone from real per-meeting entry counts), personal streak card.

- [ ] **Step 1:** Page + components. **Step 2:** Verify against seeded data. **Step 3:** Responsive check. **Step 4:** Commit.

## Task 11: Leaderboard — three layouts

**Files:** Create `src/app/(app)/leaderboard/page.tsx`, `src/components/leaderboard/{LeaderboardClient,BroadcastRow,Podium,StatSheet,Filters}.tsx`

Server Component fetches; `LeaderboardClient` owns layout/sort/filter state. **Broadcast keeps the absolutely-positioned `translateY(i * 76px)` rows and `transition: transform .65s cubic-bezier(.2,.85,.25,1)`** — the animated shuffle is the most distinctive thing in the design and must survive. Stat Sheet renders one column per active metric rather than hardcoded ATT/ASN/QUIZ, since metrics are dynamic.

- [ ] **Step 1:** Client component + state. **Step 2:** Three layouts. **Step 3:** Verify the shuffle animates when sort changes. **Step 4:** Phone: Broadcast collapses to a compact row; Stat Sheet scrolls horizontally in its own container. **Step 5:** Commit.

## Task 12: Teams

**Files:** Create `src/app/(app)/teams/page.tsx`, `src/components/teams/TeamCard.tsx`

Team points = **Σ member scores** (not the prototype's `× 21`). Per-metric team averages. "Wins" = weeks the team finished #1, computed from `scoreSnapshots` — flagged in the spec as an assumption.

- [ ] **Step 1:** Page + card. **Step 2:** Verify totals reconcile with the leaderboard. **Step 3:** Commit.

## Task 13: My Card

**Files:** Create `src/app/(app)/me/page.tsx`, `src/components/me/{FlipCard,ScoreBreakdown,SeasonLog}.tsx`

Flip card (CSS `transform-style: preserve-3d`, `rotateY(180deg)`), season log, and the score breakdown showing each metric with its weight — the transparency counterpart to the admin metric builder.

- [ ] **Step 1:** Components. **Step 2:** Verify the breakdown sums to the headline score. **Step 3:** Commit.

## Task 14: Coach Desk and the attendance write path

**Files:** Create `src/app/(app)/coach/page.tsx`, `src/components/coach/*`, `src/app/actions/attendance.ts`; Test: `tests/db/attendance.test.ts`

**Interfaces produced:**
```ts
checkIn(meetingId): Promise<Result>                      // self; source='self', status='pending'
approveEntry(entryId): Promise<Result>                   // coach/admin
rejectEntry(entryId): Promise<Result>
recordForMember(membershipId, meetingId, present): Promise<Result>   // source='coach'
approveAllPending(meetingId): Promise<Result>
```

Every action calls `requireCoachOf` / `requireUser` **first**. Lateness is derived at render time from `recorded_at` vs `starts_at + late_after_minutes` — never stored.

- [ ] **Step 1:** Write failing tests: coach approving another team's entry is rejected; self check-in creates `source='self', status='pending'`; coach override creates `source='coach'`; double check-in updates rather than duplicating; approving recomputes the member's score.
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement actions with `revalidatePath`. **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Coach Desk UI: pending/present/missing counters, approve / mark-missing rows, approve-all, top and bottom performers.
- [ ] **Step 6:** Manual check — approve an entry, confirm the leaderboard moves. **Step 7:** Commit.

## Task 15: Admin metric builder

**Files:** Create `src/app/(app)/admin/page.tsx`, `src/components/admin/*`, `src/app/actions/metrics.ts`

**Scope note:** the spec puts metric CRUD in Build 2, but shipping steppers that do nothing repeats the dead-button problem we deliberately removed from the Coach Desk. This task persists **only** metric `weight` and season `formula` — one server action on existing rows. Creating, renaming and deleting metrics stays in Build 2.

- [ ] **Step 1:** `updateMetricWeight` / `updateSeasonFormula`, both `requireRole('super_admin')`. **Step 2:** Builder UI with ± steppers, formula toggle, total-weight indicator (green at 100 %). **Step 3:** Live top-5 preview recomputed client-side from the current weights. **Step 4:** Verify a weight change reorders the real leaderboard. **Step 5:** Commit.

## Task 16: Hall of Fame

**Files:** Create `src/app/(app)/hall-of-fame/page.tsx`, `src/components/fame/*`

Legends from `scoreSnapshots` across seasons; badge cabinet from `badges` + `memberBadges` with locked/unlocked states. Award rules remain Build 3 — badges shown here are seeded rows, not computed.

- [ ] **Step 1:** Page + components. **Step 2:** Commit.

## Task 17: Verification and deploy readiness

- [ ] **Step 1:** `npm run build` — clean, zero type errors.
- [ ] **Step 2:** `npm test` — all green. Report the real count.
- [ ] **Step 3:** Move the E-VOLVE logo to `public/` and optimise (currently 274 KB).
- [ ] **Step 4:** Write `.env.example` and a `README.md` covering local setup (`file:./local.db`, no Turso credentials needed) and Vercel + Turso deploy.
- [ ] **Step 5:** Verify all seven screens at 390 / 768 / 1440 px.
- [ ] **Step 6:** Commit.

---

## Self-Review

**Spec coverage.** §2 architecture → Tasks 1, 8, 9. §3 schema → Task 2. §4 scoring/ranking/streaks → Tasks 3–5. §5 screens → Tasks 10–16. §6 RBAC → Task 7, enforced again in 14–15. §7 prototype departures → Task 6 (no `Math.random()`), 12 (team points, wins), 4 (competition ranking), 8 (device frame, view-as). §8 testing → Tasks 3–5, 7, 9, 14. §9 environment → Tasks 1, 17.

**Gap found and closed:** the spec's §7 replaces `RUN GAME WEEK` with an admin "Recompute standings" action, which no task owned. Folded into Task 15 as a third server action (`recomputeSnapshots`, `requireRole('super_admin')`), since it belongs with the other admin controls.

**Type consistency:** `Metric`, `Entry`, `Formula`, `MetricType` are defined once in `src/domain/types.ts` (Task 1) and consumed unchanged by Tasks 3–5, 9, 14, 15. Query modules return their own exported view-model types; no task references a type another task does not export.
