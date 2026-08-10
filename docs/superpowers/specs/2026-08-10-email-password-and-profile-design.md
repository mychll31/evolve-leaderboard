# Email + Password Sign-In and Account Profiles — Design

- **Date:** 2026-08-10
- **Status:** Proposed
- **Scope:** A second way in for people without Google, plus the account page that makes it usable

Google is currently the only door. Members are pre-created by an admin with an email address and
link Google on first sign-in (`src/lib/auth/config.ts:37`), so anyone without a Google account
cannot get in at all. This adds email + password alongside it, and the `/account` page that
password accounts need: name, photo, and password all editable by their owner.

Architecture unchanged. Same layering: pure `src/domain`, SQL in `src/db/queries`, writes in
`src/db/mutations` taking an explicit `Actor`, thin Server Actions on top.

## 1. The constraint that shapes everything

**Auth.js's Credentials provider always writes a JWT session cookie, even under
`session.strategy: "database"`.** The credentials branch of the callback handler is
unconditional — it calls `callbacks.jwt`, then `jwt.encode`, and sets the result as the session
cookie (`@auth/core/lib/actions/callback/index.js:236-277`), where the OAuth and email branches
do the same only inside an `if (sessionStrategy === "jwt")` guard.

This app uses database sessions deliberately. `config.ts:76` reads `role` off the live `user`
row, so a role change takes effect on the next request rather than whenever a token would
expire. A plain `Credentials({...})` would hand the browser a JWT that `auth()` — running in
database mode — then tries to look up as a session token, finds nothing, and treats as signed
out. Sign-in would appear to succeed and silently do nothing.

Two ways out were considered:

| Option | Cost |
|---|---|
| Switch the whole app to JWT sessions | Officially supported, but changes the Google path, invalidates every live session, orphans the `session` table, and needs a DB read added back into the session callback to keep `role` fresh — which is the cost database sessions were paying anyway |
| Keep database sessions; make the credentials path create a real session row | Small, contained, leaves the Google path and the dev bypass untouched |

**Decision: the second.** `jwt.encode` is overridden in the Auth.js config. Under database
strategy that hook is reachable only from the credentials branch (the other three call sites are
inside `strategy === "jwt"` guards), so it becomes "insert a `session` row, return its token".
Auth.js keeps ownership of cookie naming, the `__Secure-` prefix, expiry, chunking, and CSRF on
`/api/auth/callback/credentials`.

The alternative — a Server Action setting the session cookie by hand — was rejected because it
means re-deriving Auth.js's cookie name and `useSecureCookies` rule
(`@auth/core/lib/init.js:69`) in a second place, where a mismatch breaks sign-in in production
only.

The session row it inserts uses the same `maxAge` Auth.js applies to the cookie, so a password
session and a Google session expire identically. `signOut()` already deletes the row and clears
the cookie through the adapter, so sign-out needs no change.

This override is load-bearing and non-obvious. It gets a comment explaining the call path, in
the style of the rest of that file.

## 2. Scope

| Area | Delivered |
|---|---|
| Password sign-in | Credentials provider, scrypt hashing, failure lockout, fields on `/signin` |
| Password provisioning | Admin-generated one-time link → `/set-password`; also the reset path |
| Account page | `/account` — display name, profile photo, password, all self-serve |
| Profile photos | Client-side square cropper, bytes in the database, served by a route handler |
| Avatars rendered | TopBar, Sidebar, leaderboard rows, member profile — first time `users.image` is used |

Explicitly **not** in scope: public signup (the roster stays invite-only), email delivery of any
kind (nothing is configured, so links are handed over by the admin), and password rules beyond a
length floor.

## 3. Schema

```
user            + passwordHash            text, null       -- null = Google-only account
                + passwordFailedAttempts  integer, not null, default 0
                + passwordLockedUntil     integer, null    -- timestamp_ms

user_avatar       userId    text PK, references user(id) on delete cascade
                  mime      text not null                 -- 'image/webp' | 'image/jpeg' | 'image/png'
                  bytes     blob not null
                  updatedAt integer not null              -- timestamp_ms, doubles as the cache key
```

One `drizzle-kit generate` migration.

`passwordHash` is nullable because most accounts will never have one — a Google user who never
sets a password is a normal, permanent state, not an incomplete one.

**Avatar bytes live in their own table, not in `users.image`.** The `user` row is read on every
session resolution (`guards.ts:113`); a 30KB blob on it would be dragged through every request.
`users.image` holds a URL instead: `/api/avatar/<userId>?v=<updatedAt>`.

## 4. Passwords

`src/lib/auth/password.ts`, built on `node:crypto`:

```
hashPassword(plain)          -> "scrypt$16384$8$1$<saltB64>$<hashB64>"
verifyPassword(plain, hash)  -> boolean, via timingSafeEqual
```

**scrypt rather than bcrypt or argon2.** Both would be the first native dependency in a tree
that has none, and scrypt is memory-hard, in the standard library, and adequate at these
parameters. The cost lives in the encoded string, so parameters can be raised later and old
hashes keep verifying.

`authorize()` in the Credentials provider:

1. Normalise the email the same way `db/mutations/people.ts:28` does — trim, lowercase.
2. Load the user. **If there is no such user, or it has no `passwordHash`, still run one
   throwaway scrypt.** Otherwise a missing account answers measurably faster than a wrong
   password, which turns the roster into something anyone can enumerate.
3. Reject if `passwordLockedUntil` is in the future.
4. Verify. On failure, increment `passwordFailedAttempts`; at 10, set `passwordLockedUntil` to
   15 minutes out. On success, clear both.

**The lockout is not optional.** The deployment is a public URL with a known, guessable set of
email addresses; without a throttle, password sign-in is strictly weaker than the Google-only
status quo it is being added beside. Locking the account rather than the IP is the only option
that works on serverless with no shared store — it accepts that a determined attacker can lock a
known member out for 15 minutes at a time, which is the lesser problem.

The `signIn` callback at `config.ts:59` currently returns `false` for any provider that is not
Google. It becomes a switch: `google` keeps the `email_verified` plus roster check unchanged;
`credentials` returns true, because `authorize()` has already done both.

## 5. Getting a password in the first place

No public signup and no email sending, so provisioning is admin-driven, with one shortcut that
covers most people.

**The shortcut: a signed-in Google user can set a password from `/account` without being asked
for a current one.** They have already proved who they are. This is how nearly everyone who
wants a password will get one, and it needs no admin involvement.

**The fallback, for people who cannot get in at all:** a *Password link* button per person in
`PeopleManager` mints a single-use token and shows the URL for the admin to copy and hand over.

- Stored in the existing, otherwise unused `verificationToken` table.
- `identifier` is `set-password:<userId>`, namespaced so these can never collide with Auth.js's
  own rows if an email provider is ever added.
- Token is 32 random bytes, base64url. Expires in 7 days. Minting deletes any outstanding token
  for that user, so only the newest link works.
- `/set-password?token=…` in the `(auth)` group validates it, takes a password and a
  confirmation, and deletes the token on use. It does **not** sign the person in afterwards —
  it redirects to `/signin`, so the first thing the new password does is prove it works.

The rejected alternative was the admin typing a temporary password, which is less UI but puts a
real credential into a chat message and leaves the admin knowing it.

Password floor is **10 characters**, with no composition rules. Length is the part that matters;
character-class rules mostly produce `Password1!`.

## 6. `/account`

A page in the `(app)` group, linked from the TopBar account menu and the Sidebar. Three
independent Server Actions — name, photo, password — so a rejected photo does not discard an
edited name.

| Section | Behaviour |
|---|---|
| Display name | Edits `users.name`. Validation is the existing rule in `db/mutations/people.ts`, called, not copied. |
| Profile photo | Upload, crop, save. Remove clears both the avatar row and `users.image`. |
| Password | Has one → change it, current password required. Has none → set one, no current password. |

Admins keep their existing edit of anyone's name in `PeopleManager`; this is the same write from
the other side, so it lives in `db/mutations/people.ts` with an `Actor` check that allows a
super admin or the owner and nobody else.

## 7. Profile photos

`users.image` has existed since Build 1 and has never been rendered. `Avatar`
(`src/components/ui/index.tsx:80`) draws initials on a coloured tile and takes no image at all.

**Cropping is hand-rolled.** `AvatarCropper`, a client component: square viewport, drag to pan,
zoom slider, exported with `canvas.toBlob("image/webp", 0.85)` at 256×256. `react-easy-crop` and
friends would be the first UI dependency in a tree that has none, and a slider avoids the
pinch-gesture handling that is most of what those libraries are for. Roughly 150 self-contained
lines.

**Validation, given there is no image library server-side.** The action caps the upload at 200KB
and checks magic bytes against the declared mime; it cannot re-encode. The route handler
therefore serves every avatar with `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'`, so a file that lies about its type has nothing to
execute in. Adding `sharp` to re-encode server-side would be stronger and is the upgrade path if
avatars ever come from somewhere less trusted than a signed-in member.

`GET /api/avatar/[userId]` returns the bytes with a long immutable cache; the `?v=<updatedAt>`
query busts it on change. Missing avatar returns 404 and the UI falls back to initials.

**Rendered with a plain `<img>`, not `next/image`.** These are 34–72px, already cropped to size,
and `users.image` may hold a Google URL for OAuth accounts — `next/image` would mean configuring
`remotePatterns` for `lh3.googleusercontent.com` and paying an optimizer round trip to resize a
34px avatar. `Avatar` gains an optional `image` prop and keeps initials as the fallback.

Photos appear in four places: TopBar, Sidebar, leaderboard rows, member profile. The last two
mean adding `image` to the member selects in `db/queries/standings.ts` and the members page
query, next to the existing `initials`. A photo only its owner could see would be pointless in a
leaderboard app.

## 8. Testing

Existing style: node environment, real SQLite via `tests/helpers/db.ts`, no HTTP-level tests.

| File | Covers |
|---|---|
| `tests/db/password.test.ts` | Hash round-trip, wrong password, tampered hash string, failure counter, lockout window, counter reset on success |
| `tests/db/password-tokens.test.ts` | Mint, consume, single use, expiry, minting invalidates the previous token |
| `tests/db/account.test.ts` | Self name edit, owner-or-admin authorisation, avatar upsert and delete, oversize and wrong-magic-byte rejection |

The `jwt.encode` override is the one piece these cannot reach, since it needs a running Auth.js
request. It is covered by a manual check: sign in with a password, confirm a row appears in
`session`, confirm the role shown updates after an admin changes it without re-signing in.

## 9. Risks

**The `jwt.encode` override depends on internal call ordering in a beta package.** `next-auth` is
on `5.0.0-beta.32`. If a future beta calls `jwt.encode` from the database-strategy path too, the
symptom would be broken Google sign-in, not a silent security hole. Pinning the minor and the
manual check above are the mitigation.

**Account lockout is a denial-of-service surface** — anyone who knows a member's email can lock
them out for 15 minutes. Accepted above; Google sign-in is unaffected by the lock, so any member
with a linked Google account always has a way in.

**Avatars are not re-encoded.** Covered by response headers rather than by processing. Noted as
the first thing to revisit if uploads ever widen beyond signed-in members.

## 10. Files

```
new       src/lib/auth/password.ts              hash, verify, timing-safe compare
new       src/lib/auth/password-tokens.ts       mint, consume, expire set-password tokens
new       src/db/mutations/account.ts           self name edit, password set/change, avatar upsert/delete
new       src/app/(auth)/set-password/page.tsx
new       src/app/(app)/account/page.tsx
new       src/app/actions/account.ts
new       src/app/api/avatar/[userId]/route.ts
new       src/components/account/AvatarCropper.tsx
new       src/components/account/AccountForms.tsx
new       drizzle/0002_*.sql

edit      src/lib/auth/config.ts                Credentials provider, jwt.encode override, signIn callback
edit      src/db/schema/auth.ts                 password columns, user_avatar table
edit      src/app/(auth)/signin/page.tsx        email + password fields
edit      src/db/mutations/people.ts            share name validation; owner-or-admin rule
edit      src/app/actions/admin.ts              mint password link
edit      src/components/admin/PeopleManager.tsx  Password link button
edit      src/components/ui/index.tsx           Avatar takes an optional image
edit      src/db/queries/standings.ts           select image alongside initials
edit      src/app/(app)/members/[id]/page.tsx   select and pass image
edit      src/app/(app)/layout.tsx              pass image to TopBar and Sidebar
edit      src/components/shell/TopBar.tsx       render photo
edit      src/components/shell/Sidebar.tsx      render photo
edit      src/components/leaderboard/LeaderboardClient.tsx  render photo
```
