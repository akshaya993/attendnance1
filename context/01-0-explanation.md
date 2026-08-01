Fair criticism. Let me answer the health-route question in plain words first.

## Why we changed the health file

Think of your database as a building with a **limited number of doors** — Postgres only lets about 100 things connect at once.

Before the change, `health/route.js` opened its **own** set of doors, completely separate from the rest of your app. So you had two independent door-openers: one in `lib/db.js`, one hidden in the health file. Each can open up to 15 doors.

Three plain reasons that's bad:

1. **Wasted doors.** Two openers holding doors for the same building. With one, everything shares.
2. **Two places to change one thing.** If your database password changes, you'd have to remember to edit *both* files. People always forget the second one, and then something breaks at 11 PM.
3. **Your own rule said so.** Your project rules say "only `lib/db.js` is allowed to talk to the database directly." The health file was the one law-breaker, written before `lib/db.js` existed.

After the change, the health file just says *"hey `lib/db.js`, count the students for me."* Same URL, same answer, one less door-opener. Nothing about how your app behaves changed — which is why the answer is still exactly `{"ok":true,"students":400}`.

---

Now the explanation file. One note on where it goes: your rules say **no new top-level folders**, so instead of `docs/` I'm putting it in the existing `context/` folder, which is already documented and is where a future you (or a future AI chat) will look.

## Create this file

**File:** `C:\projects\school-app\context\01-P0-EXPLAINED.md` (new file)

```
# Prompt 0 Explained — The Foundation

**Date built:** 29 July 2026
**Feature:** 01 Attendance, Prompt 0 (project skeleton)
**Status:** Complete and tested

This file explains, in plain language, every file we created and every decision we
made. If you forget how something works, read this before touching code.

---

## 1. What we actually built today

We built the **plumbing**. No screens, no buttons, nothing a parent or teacher
could see yet.

Three things now exist that every future feature depends on:

1. **One way to talk to the database** (`lib/db.js`)
2. **One way to know who is asking** (`lib/auth.js`)
3. **A working example of a real API route** (branches + classes)

Think of it as wiring a house before putting up walls. Boring, invisible, and
everything else collapses without it.

---

## 2. Words you need to know

| Word | What it means here |
|---|---|
| **Database** | PostgreSQL. Stores all 43 tables — students, fees, marks, attendance. |
| **Connection** | A live phone line to the database. Postgres allows a limited number. |
| **Pool** | A small set of reusable phone lines (we keep max 15) so we never open a new one per request. Opening a connection is slow; reusing is fast. |
| **Route** | A URL your app answers, e.g. `/api/classes`. In Next.js the folder name becomes the URL. |
| **Repo (repository)** | A plain JS file that holds SQL queries. Not a GitHub repo — a "place where queries live". |
| **Session** | Proof of who you are, carried by your browser on every request. |
| **JWT** | A small signed text string holding your ID and role. Signed = can't be faked. |
| **Cookie** | A tiny piece of text the browser stores and sends automatically with every request. Our JWT rides in a cookie called `session`. |
| **Environment variable** | A setting kept in `.env.local`, outside the code, so passwords never end up on GitHub. |
| **Seed data** | Fake-but-realistic test data already loaded: 400 students, 20 teachers, 1 branch. |

---

## 3. File-by-file

### 3.1 `lib/db.js` — the only file allowed to talk to the database

**Job:** open the database once, hand out a simple `query()` function.

**What's inside:**

| Piece | What it does |
|---|---|
| `POOL_CONFIG` | max 15 connections, drop idle ones after 30s, give up connecting after 5s |
| `types.setTypeParser(20, Number)` | turns database IDs into real numbers (see section 6) |
| `buildPool()` | reads `DATABASE_URL` from `.env.local`; falls back to separate `PGHOST`/`PGUSER`/etc. |
| `globalThis.__schoolAppPool` | keeps exactly ONE pool alive across code reloads |
| `pool.on("error")` | logs a dropped connection instead of crashing the whole app |
| `query(text, params)` | run one SQL statement |
| `withTransaction(callback)` | run several statements all-or-nothing |

**Why the `globalThis` trick exists:** in development, Next.js reloads your code
every time you press Ctrl+S. Without the guard, each save would create a *new*
pool of 15 connections while the old ones lingered. After ~7 saves Postgres
would refuse everything with "too many clients already". Stashing the pool on
`globalThis` means reloads reuse the same one.

**Why `withTransaction` matters:** when a parent pays a fee, three things must
happen together — insert a receipt, reduce the balance, write an audit log. If
the power cuts halfway, you must end up with *none* of them, never *some*.
`withTransaction` guarantees that. **Never** use the plain `query()` inside a
transaction — it grabs a different phone line, so it wouldn't roll back with the
others.

**Why `$1` instead of gluing text together:**

```

query("SELECT * FROM classes WHERE branch_id = $1", [branchId])   // safe

query("SELECT * FROM classes WHERE branch_id = " + branchId)      // NEVER

```

The safe version sends the SQL and the value separately, so a value can never be
read as a command. The unsafe version lets someone pass
`4; DROP TABLE students` and delete your school.

---

### 3.2 `lib/auth.js` — the only file that decides who you are

**Job:** read the `session` cookie, verify it wasn't faked, return who the user
is. This is a **temporary stub**; feature 13 replaces it with the real version
(but must keep the same names).

**What's inside:**

| Piece | What it does |
|---|---|
| `COOKIE_NAME = "session"` | the cookie we read. **Feature 13 must reuse this exact name.** |
| `VALID_ROLES` | `admin`, `teacher`, `parent`, `bus` — mirrors the database's own rule |
| `AuthError` | an error that carries an HTTP status (401 or 403) |
| `getSecretKey()` | reads `JWT_SECRET` from `.env.local` |
| `readCookie()` | pulls the cookie out of the incoming request |
| `getSession(request)` | returns `{ profileId, role, branchId }` **or `null`** |
| `getSessionUser` | an alias for `getSession` (same function, second name) |
| `requireRole(user, roles)` | throws 401 if not logged in, 403 if wrong role |

**How the signature works:** a JWT has three parts separated by dots. The middle
part holds your data. The last part is a signature calculated from that data
**plus your secret key**. Change even one character of the data and the
signature no longer matches, so the server rejects it. Nobody can promote
themselves from `parent` to `admin` without knowing `JWT_SECRET`.

**Important:** a JWT is **encoded, not encrypted** — anyone holding it can *read*
it. That's why we only put 3 harmless values in it and never a phone number,
fee amount, or address.

**Why only `profileId`, `role`, `branchId`?** Those three answer every question a
route needs: *who are you, what may you do, which branch's data may you see.*
Anything else we look up fresh from the database, so it's never stale.

**Why `branchId` comes from the token and NEVER the URL:** if a route trusted
`?branchId=7` from the address bar, any teacher could type another branch's
number and read its students. The token is signed, so it can't be edited.
**This is the single most important security rule in the whole app.**

**Why `getSession` returns `null` instead of throwing:** two different jobs.
`getSession` only answers "who is this?" — "nobody" is a perfectly valid answer.
`requireRole` is the one that says no. Keeping them separate means a public route
can call `getSession` alone without wrapping it in error handling.

**Fail-closed:** anything wrong — no cookie, expired, tampered, unknown role —
gives `null`, which means "not logged in", which means access denied. There is no
code path that grants access by accident.

**Why two names (`getSession` and `getSessionUser`):** the prompt asked for
`getSessionUser`, the architecture doc says `getSession`. Rather than pick a
loser, one is an alias of the other, so no route breaks whichever name it used.
**Feature 13 must keep that alias line.**

---

### 3.3 `lib/repos/coreRepo.js` — shared database questions

**Job:** hold the SQL for reading branches and classes.

| Function | Returns |
|---|---|
| `listAllBranches()` | every branch (admin only) |
| `listOwnBranch(branchId)` | one branch, still inside an array |
| `listClassesByBranch(branchId)` | that branch's classes, sorted 1A → 10C |

**Why a repo file at all?** The project rule is *"all SQL lives in
`lib/repos/*.js`, never inside a route"*. That way, when the database changes,
you fix one file instead of hunting through 60 routes. It also keeps routes short
and readable — a route becomes "check permission, ask repo, return answer".

**Why `coreRepo` and not `branchRepo` + `classRepo`?** Branches and classes are
read by attendance, fees, marks, timetables, groups and admissions. They belong
to no single feature, so they live in one shared file. **Later features must
import from here instead of writing these queries again.**

**Why `listOwnBranch` returns an array containing one item:** so the front end
gets a list either way. If admins got a list and teachers got a single object,
every screen would need two versions of the same code.

---

### 3.4 `app/api/branches/route.js` and `app/api/classes/route.js`

**Job:** the first real API endpoints. `GET /api/branches` and `GET /api/classes`.

The folder name **is** the URL. `app/api/classes/route.js` → `/api/classes`.

Both follow the same five steps, in this exact order, and every future route will
too:

```

1. SESSION   who is calling?            getSession(request)
2. ROLE      are they allowed?          requireRole(user, [...])
3. VALIDATE  is their input sane?       (nothing to check here)
4. REPO      ask the database           coreRepo function
5. RESPOND   one fixed shape            { ok: true, data }

```

The order is the security. Identify before allowing, allow before touching
input, never let unchecked input reach SQL. Because every route looks identical,
a missing step is easy to spot.

**Who can call what:**

| Route | Allowed | Behaviour |
|---|---|---|
| `/api/branches` | all four roles | admin sees all branches; everyone else sees only their own |
| `/api/classes` | admin, teacher | always the caller's own branch, taken from the token |

**Response shape, always:**

```

{ "ok": true,  "data": [ ... ] }

{ "ok": false, "error": "message" }

```

| Code| Meaning |
|---  |-       --|
| 400 | you sent bad input |
| 401 | you are not logged in |
| 403 | you are logged in but not allowed |
| 404 | it doesn't exist |
| 500 | our fault |

**Why `err.name === "AuthError"` and not `err instanceof AuthError`:** during
hot reload, Next.js can hold two copies of the same file in memory. `instanceof`
compares class identity, so it can silently fail and turn a clean 401 into a
confusing 500. Comparing the name text always works.

**Why 500 responses hide the real error:** a database error can contain table
names, column names, even real data. `console.error` puts the full detail in your
terminal where you need it; the browser only sees "Something went wrong."

**Why `export const dynamic = "force-dynamic"`:** it tells Next.js never to cache
these. A cached response would show one user another user's data.

---

### 3.5 `app/api/health/route.js` — the smoke test

**Job:** answer `{"ok":true,"students":400}` so you can confirm in one second
that the app is running and the database is reachable.

**What changed today:** it used to open its own database connection. Now it
imports `query` from `lib/db.js` like everything else. Same URL, same answer,
one less connection pool. (Plain-English reasons in section 5.)

**Deliberately has no login check** — a health probe must answer even when nobody
is signed in, and a row count reveals nothing sensitive. It's also the only route
that shows the real error message, because its whole job is telling you *why* the
database is unreachable.

**Its answer is a contract.** After every task in this project, check
`/api/health` still says exactly `{"ok":true,"students":400}`.

---

## 4. What happens when a request comes in

Someone opens `/api/classes`:

1. The browser sends the request **and automatically attaches the `session`
   cookie**.
2. Next.js matches the URL to `app/api/classes/route.js` and runs `GET`.
3. `getSession(request)` pulls the cookie out and verifies its signature with
   `JWT_SECRET`.
4. Signature good and not expired → returns `{ profileId: 1266, role: "admin",
   branchId: 4 }`. Anything wrong → `null`.
5. `requireRole(user, ["admin","teacher"])` — `admin` is in the list, so it
   passes. A parent would get 403 here.
6. `listClassesByBranch(4)` runs `SELECT ... WHERE branch_id = $1` using one of
   the pool's 15 connections, then returns it to the pool.
7. The route replies `{ ok: true, data: [ 16 classes ] }`.

Total database queries: **one**. No session lookup, because the cookie itself is
the proof — that's the main reason JWTs are cheap to run on a small server.

---

## 5. Tools we used and why

| Tool | Why this one |
|---|---|
| **PostgreSQL 16** | free, self-hosted, handles transactions properly (essential for money) |
| **`pg` package** | plain SQL, no ORM. You see exactly what runs and can fix slow queries |
| **`jose`** | creates and verifies JWTs; works in Next's edge runtime |
| **Next.js route handlers** | one folder = one URL, same project as the UI |
| **`.env.local`** | secrets stay out of GitHub (it's in `.gitignore`) |
| **`psql`** | inspect the database directly from the terminal |
| **`curl.exe`** | test API routes from the terminal without a browser |

**Why no ORM (no Prisma):** every SQL statement is visible and tunable, nothing
is generated behind your back, and there's one less thing to learn. The cost is
that you must write SQL yourself — which is exactly why all of it is confined to
`lib/repos/`.

---

## 6. Decisions we made, and why

| Decision | Reason |
|---|---|
| `DATABASE_URL` preferred, `PG*` as fallback | `.env.local` already used it and it works |
| Cookie named `session` | feature 13 must reuse this exact name |
| Read `JWT_SECRET`, fall back to `SESSION_SECRET` | the docs and the working env file disagreed; support both |
| `getSessionUser` is an alias for `getSession` | prompt and architecture doc used different names; neither breaks |
| `requireRole` gives 401 **and** 403 | "not logged in" and "not allowed" are different problems. Without the 401 check, a missing user would have crashed with a 500 |
| `lib/repos/coreRepo.js` created | "no SQL in routes" is an absolute rule; the shared folder is a documented location |
| Branch always from the session | prevents reading another branch by editing the URL |
| `/api/classes` = admin + teacher | parents and buses have no use for a class directory |
| Convert BIGINT ids to numbers | see below |
| Money (`NUMERIC`) left as text | see below |
| Skipped the prompt's "create schema" task | the real 43-table schema already exists and is loaded |

### The BIGINT / money detail (worth understanding)

Every `id` in the schema is a `BIGINT`. Those can be bigger than JavaScript can
count exactly, so the `pg` driver returns them as **text** to be safe: `"4"`
instead of `4`.

That's dangerous in a quiet way:

```

row.branch_id === user.branchId   // "4" === 4  →  false

```

That looks obviously correct and is always false. Nothing crashes — a list just
comes back empty and you spend an evening confused. So `lib/db.js` converts
`BIGINT` to a real number once, for the whole app.

We deliberately do **not** do this for `NUMERIC`, which is what fee amounts use.
Computers store decimals imprecisely — `0.1 + 0.2` genuinely equals
`0.30000000000000004` in JavaScript. Money must never touch that, so amounts stay
as text, arithmetic happens in SQL, and JavaScript only formats them for display.

---

## 7. What we deliberately did NOT build

| Not built | Where it comes from |
|---|---|
| Login / logout screens | feature 13 |
| Password checking | feature 13 (`bcryptjs` is already installed) |
| Middleware that protects pages | feature 13 |
| Any UI | feature 01 proper, onwards |
| Database changes | never — the 43-table schema is final |

**We did not touch `db/schema.sql`.** One prompt asked us to create it with UUID
ids and 10 tables. Refused: the real schema has 43 tables with `BIGINT` ids and
is already loaded with 400 students. Running it would have destroyed everything.
Rule: **if a task seems to need a schema change, stop and ask.**

---

## 8. How to test the whole thing

**Health (no login needed):**

```

curl.exe -s http://localhost:3000/api/health

```
→ `{"ok":true,"students":400}`

**Protected routes.** Login doesn't exist yet, so we hand-make a token. From the
project folder, replacing the two numbers with a real profile's `id` and
`branch_id`:

```

node -e "const fs=require('fs');const m=fs.readFileSync('.env.local','utf8').match(/^s*JWT_SECRETs*=s*(.+)$/m);const secret=m[1].trim().replace(/[x22x27]/g,'');import('jose').then(async({SignJWT})=>{const t=await new SignJWT({profileId:1266,role:'admin',branchId:4}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('30d').sign(new TextEncoder().encode(secret));console.log(t)})"

```

Then call a route with it:

```

curl.exe -s -H "Cookie: session=PASTE_TOKEN" http://localhost:3000/api/branches

curl.exe -s -H "Cookie: session=PASTE_TOKEN" http://localhost:3000/api/classes

```

**Find IDs in the database:**

```

& "C:Program FilesPostgreSQL16binpsql.exe" -U school_app -d school -c "SELECT id, branch_id, role FROM profiles WHERE phone_number = '9000000001';"

```

**Expected results:**

| Test | Expected |
|---|---|
| `/api/health` | `{"ok":true,"students":400}` |
| `/api/branches` as admin | 1 branch — "Greenwood High School - Main Branch", id 4 |
| `/api/classes` as admin | 16 classes, ids 49–64, sorted 1A → 10C |
| any route with no cookie | 401 `{"ok":false,"error":"Not signed in"}` |
| `/api/classes` as parent | 403 `{"ok":false,"error":"You do not have access to this resource"}` |

**The 401 test matters most.** A route that returns data is easy. A route that
correctly refuses is the one protecting 400 children's records.

---

## 9. Things that will trip you up again

- **Cookies with no `Max-Age` die when the browser closes.** This cost us 40
  minutes today. Feature 13's login MUST set an explicit `Max-Age` matching the
  token's expiry, or every parent gets logged out every time they close the app.
- **`localhost` and `127.0.0.1` do not share cookies.** Same machine, different
  cookie jars.
- **Type parsers only load at startup.** After editing `lib/db.js`, stop the
  server with Ctrl+C and run `npm run dev` again — a hot reload isn't enough.
- **`curl.exe`, not `curl`,** in PowerShell. Plain `curl` is a different command.
- **You can't log a JWT out.** The server keeps no session list, so a token stays
  valid until it expires. Rotating `JWT_SECRET` invalidates every token at once —
  which is why the pre-deploy checklist demands a fresh secret.
- **`cd` moves into folders, not programs.** To run a program, type its path. In
  PowerShell, a path containing spaces needs `&` in front.
- **Branch ids don't start at 1.** Ours is 4. Never assume 1 in a test.
- **Column names are exact.** `class_number` and `section`, not `class_name`.
  `parent_profile_id`, not `parent_id`. `date_of_birth`, not `dob`.

---

## 10. Status

| Item | State |
|---|---|
| `db/schema.sql` | already existed, loaded, seeded, untouched |
| `lib/db.js` | done and proven |
| `lib/auth.js` | stub done, replaced in feature 13 |
| `lib/repos/` | created, holds `coreRepo.js` |
| `app/api/branches/route.js` | done and tested |
| `app/api/classes/route.js` | done and tested |
| `app/api/health/route.js` | refactored to use `lib/db.js` |

**Next:** feature 13 (Auth) builds real login, then feature 09 Notifications,
then the rest of feature 01 Attendance.
```

---

## Then finish Prompt 0

Add these to `context/progress-tracker.md` — flip the row and append the decisions:

Change the status line for `01-P0` from `NOT STARTED - NEXT UP` to `DONE - 29 Jul 2026`, and add to the decisions log:

```
- 29 Jul 2026 - 01-P0 COMPLETE. lib/db.js, lib/auth.js (stub), lib/repos/coreRepo.js,
  /api/branches, /api/classes all built and tested. See context/01-P0-EXPLAINED.md.
- 29 Jul 2026 - DECISION: lib/repos/coreRepo.js holds shared branch/class reads.
  Later features MUST import it, never re-query branches or classes.
- 29 Jul 2026 - DECISION: /api/branches returns all branches for admin, own branch
  only otherwise. /api/classes is admin+teacher and always uses session.branchId -
  branch is NEVER accepted from the query string.
- 29 Jul 2026 - DECISION: lib/db.js sets types.setTypeParser(20, Number) so BIGINT
  ids arrive as numbers. NUMERIC (money) intentionally left as text.
- 29 Jul 2026 - SKIPPED prompt-file Task 3 (create db/schema.sql). Stale sketch with
  UUID ids and 10 tables. Real schema is 43 tables, already loaded. No change made.
- 29 Jul 2026 - Health route refactored to import { query } from "@/lib/db" - the
  authorized one-time exception to iron rule 2. URL and response shape unchanged.
- 29 Jul 2026 - NOTE for feature 13: session cookie MUST have an explicit Max-Age
  matching the JWT exp. Without it the cookie dies on browser close and every
  parent is logged out of the PWA on every app close.
```

Then commit everything:

```
cd C:\projects\school-app
git add -A
git commit -m "feat(01-P0): complete project skeleton - db pool, auth stub, coreRepo, branches/classes routes, health refactor, explainer doc"
git push
```

Prompt 0 is done. When you're ready, open a **new chat** for feature 13 (Auth) — that's the next item in your build order, and it's the feature that turns today's hand-made token into a real login.