# Feature 13 — Authentication, Sessions & OTP: Complete Reference

**Status:** DONE. Every task built and manually tested 2026-08-03 to 2026-08-05.
**Branch containing this work:** `all-features-in-13-are-done-with-testing`
(repo `akshaya993/school-app-branches`), commit `b228514c`.
**Read this file before touching ANY auth, session, cookie, password or OTP code.**

This file has nine parts:

- PART A — Vocabulary (what the words mean)
- PART B — The concepts, in plain English (sessions, cookies, epoch, lockout, OTP)
- PART C — Database changes and indexes
- PART D — Every file, what it does, who uses it
- PART E — Every route (URL), public or protected, what it returns
- PART F — The five user journeys, step by step
- PART G — Navigation: what actually makes a new page open
- PART H — Security, layer by layer
- PART I — Rules for the next AI chat / next feature (READ THIS OR YOU WILL
  DUPLICATE WORK)

---

# PART A — Vocabulary

| Word | What it means in THIS project |
|---|---|
| **Profile** | One row in the `profiles` table = one human who can log in. Admin, teacher, parent or bus staff. There is no separate "users" table. |
| **Role** | One of exactly four strings: `admin`, `teacher`, `parent`, `bus`. Stored on the profile, copied into the session token. |
| **Hash** | A one-way scramble of a password. `Pass@123` becomes `$2a$10$N9qo8u...`. You cannot reverse it. To check a password you scramble the typed one the same way and compare the two scrambles. |
| **bcryptjs** | The library that does the scrambling. Pure JavaScript, no compiler needed. |
| **JWT** | JSON Web Token. A short string with three dot-separated parts holding a few facts (who you are, your role) plus a signature that proves the server wrote it. |
| **jose** | The library that signs and verifies our JWTs. |
| **Session** | The state of "this browser is logged in as profile 1266". In this app the session is NOT stored in the database — it lives entirely inside the JWT in the cookie. |
| **Cookie** | A small string the browser stores for a site and re-sends automatically on every request to that site. Ours is named `session`. |
| **Epoch** | A counter on the profile (`session_epoch`). Every token carries the counter value it was born with. Raise the counter and every old token instantly becomes invalid. Our "log out everywhere" button. |
| **OTP** | One-Time Password. A 6-digit code sent to email (or SMS) to prove you can read that inbox. Used ONLY for password reset, never for normal login. |
| **Purpose** | Why an OTP exists. Only `reset` and `first_login` are allowed by the database. |
| **Lockout** | After 5 wrong passwords the profile is frozen for 15 minutes. |
| **Enumeration** | An attacker discovering WHICH phone numbers have accounts by watching for different error messages. We defend against this everywhere. |
| **Proxy** | The file `proxy.js` at the project root. It runs before every request and blocks the ones that shouldn't get through. On Next.js 15 and earlier this file was called `middleware.js`. |
| **Edge runtime** | A cut-down JavaScript environment where `proxy.js` runs. It is fast but has NO database access. This single fact shapes the whole security design. |
| **Repo (repository file)** | A file in `lib/repos/`. The ONLY place in the entire project allowed to contain SQL. |
| **Server component** | A page that runs on the server only. Can read the database directly. Cannot have onClick handlers. Default in Next.js App Router. |
| **Client component** | A file starting with `"use client"`. Runs in the browser. Can have onClick, useState, timers. Cannot touch the database — it must call an API route. |

---

# PART B — The concepts, in plain English

## B1. Why passwords are the primary login and OTP is not

Most Indian school apps log you in with an OTP every time. We deliberately did
NOT do that, for one reason: **money**. Every SMS costs ₹0.15–0.25 and India
requires TRAI DLT registration (~₹5,000 one-time) before you can send any
transactional SMS at all. With 400 parents logging in twice a week that is a
recurring bill for something a password does for free.

So: **password login is primary and free. OTP exists only to recover a forgotten
password, or for a first login.** That is why the yearly OTP quota (30 per phone)
is tiny and nobody notices — a normal user needs zero OTPs per year.

## B2. How a password check actually works

Passwords are never stored. Only the hash is stored, in `profiles.password_hash`.

Signup/seed:  "Pass@123" + random salt --bcrypt cost 10--> "$2a$10$N9qo8u..."
stored in the DB
Login:        typed password + the salt inside the stored hash
--bcrypt--> compare the two hashes


Three details that matter:

- **Cost 10** means bcrypt deliberately takes ~50-100ms. That slowness is the
  feature: it makes guessing millions of passwords impractical.
- **72 bytes maximum.** bcrypt silently ignores anything past 72 bytes, so a
  1000-character password would be no stronger than its first 72 bytes. We reject
  longer ones openly instead of pretending. Note *bytes*, not characters — one
  emoji or Telugu character can be 3-4 bytes. `validatePassword()` counts with
  `TextEncoder`, not `.length`.
- **The seed data is compatible.** `db/seed.sql` hashed passwords using
  PostgreSQL's `pgcrypto` extension: `crypt('Pass@123', gen_salt('bf', 10))`.
  That produces a standard `$2a$10$...` bcrypt hash, and `bcryptjs.compare()`
  reads it correctly. Verified live. **No re-hashing or migration is ever needed.**

## B3. What a session is, and why ours lives in a cookie

Two ways to remember that someone is logged in:

1. **Server-side sessions** — store a row in the database for every login, give
   the browser a random ID. Every single page load then costs a database query.
2. **Stateless tokens (what we use)** — put the facts inside a signed token and
   hand it to the browser. The server can verify it with maths alone, no database.

We chose (2) because this app runs on one cheap VPS and most users are on slow
Android phones. Verifying a signature takes microseconds; a database round trip
takes milliseconds and holds a connection from a pool of 15.

Our token (a JWT signed HS256 with `JWT_SECRET`) carries exactly five facts:


profileId  1266          who you are
role       "admin"       what you may see
branchId   1             which school branch
epoch      0             which "generation" of your session this is
issuedAt   <timestamp>   when it was minted (used for sliding renewal)


Nothing secret is in there. A JWT is *signed*, not *encrypted* — anyone can read
it. The signature only proves **we** wrote it and nobody edited it. If a parent
changed `"role":"parent"` to `"role":"admin"`, the signature would no longer
match and `getSession()` would reject the whole token.

## B4. The cookie, setting by setting

The token is delivered in a cookie named `session`, configured in
`sessionCookieOptions(role)` in `lib/auth.js`:

| Setting | Value | Why |
|---|---|---|
| `httpOnly` | `true` | JavaScript in the page **cannot read this cookie**. If someone ever injects a script into our app, it still cannot steal the session. This is the single most important line in the auth system. |
| `sameSite` | `"lax"` | The browser won't send the cookie on requests started by another website, which kills CSRF for POSTs. `lax` (not `strict`) so that following a link into the app still arrives logged in. |
| `secure` | `true` in production only | HTTPS-only. Off in development because `localhost` is plain HTTP. |
| `path` | `/` | Sent for every URL in the app. |
| `maxAge` | 30 or 100 days | See B5. |

**Why not `localStorage`?** Because `localStorage` is readable by any JavaScript
on the page, including anything injected by a bad browser extension or a script
bug. A cookie with `httpOnly` is not. This is why `code-standards.md` forbids
`localStorage` for tokens.

(We DO use `localStorage` for two harmless things: the chosen light/dark theme,
and the OTP resend countdown deadline. Neither is a secret.)

## B5. Sliding sessions — why nobody gets logged out

Decision: **parents, teachers and bus staff stay signed in for 100 days. Admins
for 30 days.** Constants live in `SESSION_DAYS` in `lib/auth.js`.

Reasoning: a parent opens this app to check one attendance mark. If it demands a
password every week, they stop opening it. Admins handle fees and marks, so a
shorter window is worth the friction.

"Sliding" means the clock restarts as you keep using the app — but not on every
request. `REFRESH_AFTER_DAYS = 10`: a token is only re-issued once 10 days of its
life have been used. So an active parent is effectively never logged out, while
we still avoid re-signing and re-setting a cookie on every page view.

The window closes only for someone who disappears for 100 days straight.

## B6. `session_epoch` — the kill switch (the cleverest part of Feature 13)

Stateless tokens have one famous weakness: **you cannot un-issue them.** Once a
signed token is in the wild, it stays valid until it expires. If a parent's phone
is stolen, "change your password" would normally do nothing to the thief's
already-issued 100-day token.

Fix: one small integer column, `profiles.session_epoch`, default `0`.

Login:            epoch is read from the profile (say 0) and BAKED into the token.
Password change:  session_epoch becomes 1.
Next request:     token says epoch 0, profile says epoch 1  ->  MISMATCH  ->  signed out.

Every device holding an old token is ejected on its next request. This is what
you saw live when a single SQL statement logged you out of the browser:

​
UPDATE profiles SET session_epoch = session_epoch + 1 WHERE phone_number='9000000001';



It costs one `SMALLINT` per profile and zero extra queries, because the epoch is
compared during a profile read the page was making anyway.

**Where the comparison happens — and why not in `proxy.js`:**
`proxy.js` runs on the **Edge runtime, which cannot load the `pg` library**, so it
cannot read `session_epoch`. It therefore checks only the two things maths can
prove: *is the signature valid* and *has the token expired*. The epoch comparison
happens one layer deeper, in Node — in `app/page.js` and in
`/api/auth/change-password`. Remember this before "improving" `proxy.js`.

Who bumps the epoch:

| Action | Epoch bumped? | Effect |
|---|---|---|
| Log out (`/api/auth/logout`) | **No** | Only this device's cookie is cleared. Your phone stays signed in. Deliberate — logging out on a school computer shouldn't kick you off your own phone. |
| Forgot-password reset | **Yes** (inside `setPassword`) | Every device signed out. Correct: you're resetting because something is wrong. |
| Change password while signed in | **Yes**, then this device's cookie is re-minted at the new epoch | Other devices out, current device stays. |

## B7. Lockout — surviving a guessing attack

Two columns do the work: `failed_login_attempts` and `locked_until`.

- Wrong password → counter +1.
- Counter reaches **5** → `locked_until = now() + 15 minutes`, and a row is written
  to `audit_logs` with action `auth.lockout`.
- While locked, the login route returns **HTTP 423 Locked** with
  *"Too many failed attempts. Try again in 15 minutes."* — **even if the password
  is now correct** (verified in testing).
- Any successful login resets the counter to 0 and clears `locked_until`.

**A decision worth remembering:** that 423 message admits the account exists,
which technically leaks information. We discussed it and chose to keep it,
because a real parent locked out at 9pm before a fee deadline needs to know it
will fix itself in 15 minutes. Without the message they will phone the school.
This is a conscious trade of a small leak for real usability. Do not "fix" it
without asking.

Manual unlock (support desk):

UPDATE profiles SET failed_login_attempts=0, locked_until=NULL WHERE phone_number='...';


## B8. Anti-enumeration — the byte-identical response rule

If "no such number" and "wrong password" returned different messages, anyone
could feed in 10-digit numbers and harvest a list of every family enrolled at the
school. So:

- Both cases return **HTTP 401** with the exact same string:
  `"Incorrect phone number or password"`.
- Both take the same amount of time. When the phone number doesn't exist we still
  run a bcrypt comparison against a hardcoded `DUMMY_HASH`, purely to burn the
  same ~80ms. Without it, "instant reply = no such account" would be readable
  from a stopwatch.
- OTP send **always** returns 200 with
  `"If an account exists, a code has been sent."` — for a real number, an unknown
  number, an over-quota number and a cooling-down number alike. The same
  `identicalResponse` object is reused so the bodies are byte-for-byte equal.
- OTP verify has exactly ONE failure message for wrong / expired / already-used /
  no-such-code: *"That code is not valid or has expired. Request a new one."*

**Consequence for testing that trips everyone up:** the HTTP response tells you
nothing. To verify OTP behaviour you MUST look at either the dev terminal (which
prints `[otp/send] COOLDOWN:` / `[otp/send] BLOCKED:` lines) or a
`SELECT count(*) FROM otp_codes` before and after. Measured: a refused send
returns in 22-46ms, a real send takes 163-584ms.

Honest 400 errors are allowed for **shape** problems only — "Enter a valid
10-digit phone number", "Enter the 6-digit code" — because those describe what
*you* typed, not what exists in our database.

## B9. OTP, end to end

| Property | Value | Why |
|---|---|---|
| Length | 6 digits | Familiar; 1 in a million per guess. |
| Generated by | `randomInt` from `node:crypto` | Cryptographically random. `Math.random()` is predictable and must never be used for codes. |
| Stored as | **bcrypt hash** in `otp_codes.code_hash` | A stolen database dump gives an attacker nothing usable. Same rule as passwords. |
| Lifetime | **5 minutes** (`expires_at`) | Long enough for a slow email, short enough to be useless later. |
| Guesses | **5**, counted in `otp_codes.attempts` | Stops brute-forcing 6 digits. |
| Single use | `consumed_at` timestamp | A code cannot be replayed. Verified: second use returns 400. |
| Quota | **30 per phone number per rolling 365 days** | Cost cap. Counted with `created_at > now() - interval '365 days'` — the rows themselves are the history, no counter column needed. |
| Resend cooldown | **45s server / 60s shown** | See B10. |
| Purposes allowed | `reset`, `first_login` (DB CHECK constraint) | Only `reset` is actually used today. |
| Superseding | A new code retires older unconsumed codes for the same phone+purpose | Only the newest code works. `createOtp()` is the ONLY place this happens. |
| Delivery | **Email by default for every role**, visible switch to SMS | Email is free. SMS needs DLT. |

**The reset token.** After a correct code, we do NOT log the person in. We set a
second, separate cookie called `reset`: a `jose` JWT with `purpose:"reset"` that
lives **10 minutes**. `/api/auth/reset-password` trusts nothing except that
cookie — not a phone number in the request body, not the session cookie. So even
someone who can send whatever JSON they like cannot reset another person's
password without first proving they read that person's inbox.

## B10. The resend cooldown (Task 9C) and "SMS pumping"

The resend button was originally unthrottled. Twelve impatient clicks would burn
12 of a family's 30 yearly codes, and there is no admin screen to give them back.
The named attack is **SMS pumping**: a bot hammers a send endpoint so the victim
pays per message. Ours is email today, but the same button will send paid SMS the
moment DLT registration completes.

Design:

- **Server rule, 45 seconds.** `otpCooldownRemaining(phoneNumber, purpose)` in
  `lib/repos/authRepo.js` asks the database how long ago the newest code for that
  phone+purpose was created. Elapsed time is computed **in SQL** so the *database*
  clock decides — a wrong clock on the web server cannot be exploited.
- **A refused send is silent.** It returns the same generic 200, so an attacker
  cannot use the cooldown as a "does this account exist" oracle.
- **A refusal never reaches `createOtp()`.** No row, no quota spent, and — because
  `createOtp` is the only place old codes are retired — **the code already in the
  user's inbox stays valid.**
- **The UI shows 60 seconds**, deliberately longer than the server's 45. The
  server refuses silently, so if the button unlocked at exactly 45s a slightly
  fast browser clock would produce "code sent" with nothing arriving. The 15-second
  buffer makes that impossible.
- **The deadline is stored in `localStorage`** as an absolute timestamp
  (`{ phone, until }` under key `otpCooldown`). The first draft kept it in React
  state only, so pressing **F5** unlocked the button while the server still
  refused — the exact silent-failure bug described above. Verified fixed: a
  refresh restores `WAIT 0:43`.
- **No schema change was needed.** `created_at` plus the existing
  `idx_otp_phone (phone_number, created_at DESC)` index answers the question in a
  single index lookup.

What other apps do, for comparison: WhatsApp shows "Wait 0:59 to resend";
Instagram, Gmail and Microsoft grey the link out; Indian bank/UPI flows show
"Resend OTP in 30s" and cap around 3 per transaction; Twilio Verify and AWS
Cognito enforce provider-side rate limits. A future upgrade would be escalating
backoff (30s → 60s → 5min). One thing this app does that most don't: **keeping the
previous code valid** through a refusal, which is strictly friendlier.

## B11. Admin password rotation

`ADMIN_PASSWORD_MAX_AGE_DAYS = 30`, and `isPasswordExpired(role, passwordChangedAt)`
returns true only for `role === 'admin'`. A NULL `password_changed_at` also counts
as expired, so a never-rotated admin is caught.

Teachers, parents and bus staff are **never** forced to rotate. Forced rotation on
400 parents would generate support calls and push them toward `Pass@1234`.

The rule is enforced where it cannot be skipped — the home page (`app/page.js`),
which redirects to `/first-login`. Combined with `must_change_password`, that
means a temporary-password account cannot reach any real screen until it sets a
real password.

---

# PART C — Database changes and indexes

## C1. What Feature 13 changed in the database

**One migration file: `db/migrations/002_auth_columns.sql` — already applied.**
BEGIN;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session_epoch SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
UPDATE profiles SET password_changed_at = created_at WHERE password_changed_at IS NULL;
COMMIT;


| Column | Type | Purpose |
|---|---|---|
| `session_epoch` | `SMALLINT NOT NULL DEFAULT 0` | The kill switch (B6). |
| `password_changed_at` | `TIMESTAMPTZ` | Admin 30-day rotation (B11). Backfilled to `created_at` so existing rows aren't instantly "expired". |

`IF NOT EXISTS` makes it safe to run twice. `BEGIN/COMMIT` makes it all-or-nothing.
**`db/schema.sql` and `db/seed.sql` were NOT touched** — the project rule is that
those two files are frozen and changes arrive as numbered migrations.
`001_v1_1.sql` is reserved for Feature 14; we intentionally took `002`.

## C2. Columns that already existed and are used by Feature 13

On `profiles`: `id`, `branch_id`, `role`, `full_name`, `phone_number` (UNIQUE),
`email`, `password_hash`, `must_change_password`, `last_login_at`,
`failed_login_attempts`, `locked_until`.

Table `otp_codes` (owned by Feature 13, already in `schema.sql`):


CREATE TABLE otp_codes (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
phone_number TEXT NOT NULL,
code_hash TEXT NOT NULL,
purpose TEXT NOT NULL CHECK (purpose IN ('reset','first_login')),
expires_at TIMESTAMPTZ NOT NULL,
attempts SMALLINT NOT NULL DEFAULT 0,
consumed_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes(phone_number, created_at DESC);


Note there is **no foreign key** to `profiles`. Deliberate: a code can be
requested for a phone number that has no account, and we must handle that
identically to a real one (B8).

## C3. Indexes — which ones Feature 13 leans on and why

| Index | Used by | Why it matters |
|---|---|---|
| `profiles.phone_number UNIQUE` | Every single login, every OTP send | This is the hottest lookup in the app. The UNIQUE constraint creates the index for free, and also guarantees one account per phone number. |
| `idx_otp_phone (phone_number, created_at DESC)` | `createOtp`, `findRedeemableOtp`, `countOtpsInLastYear`, `otpCooldownRemaining` | The `DESC` on `created_at` is the important half: "newest code for this phone" is answered by reading the first index entry, no sorting. All four OTP queries ride this one index. |
| `idx_profiles_branch_role` | Not used by Feature 13 | Belongs to list screens in later features. |
| `idx_audit_branch_time`, `idx_audit_entity` | Reading `audit_logs` later | Feature 13 only writes; admin screens will read. |

**No new index was created, on purpose.** `session_epoch` and
`password_changed_at` are only ever read as part of fetching one profile by its
primary key or by phone number, both already indexed. An index on a column that is
never a search condition costs write speed and buys nothing.

## C4. Audit rows Feature 13 writes

Only two actions, both from `AUDIT_ACTIONS` in `lib/audit.js`:

| Action | When | Details JSON |
|---|---|---|
| `auth.admin_login` | An **admin** logs in successfully. Teachers/parents/bus deliberately do NOT generate a row. | `{ phoneNumber }` |
| `auth.lockout` | The 5th consecutive failure locks an account, **any** role | `{ role, phoneNumber, failedAttempts, lockoutMinutes }` |

**Deliberately NOT audited:** OTP send/verify, password reset, password change.
Rationale: OTP rows already exist in `otp_codes` with timestamps, and 400 parents
resetting passwords would bury the fee and marks entries that audits exist for.
There is no `auth.otp_*` or `auth.password_changed` action in `AUDIT_ACTIONS` —
**do not invent one** without a decision.

---

# PART D — Every file, what it does, who uses it

Legend: 🎨 **UI** (what the user sees) · 🧠 **Logic** (shared rules, no SQL) ·
🗄️ **Backend** (SQL or HTTP endpoint) · ⚙️ **Config**

## D1. The shared brain — `lib/`

### 🗄️ `lib/db.js` — DO NOT MODIFY, DO NOT RECREATE
Owned by Feature 01-P0. The **only** file in the project that imports `pg`.
Exports `pool`, `query(text, params)`, `withTransaction(callback)`. Pool
`max: 15`, cached on `globalThis.__schoolAppPool` so hot-reload doesn't open a new
pool every save. Feature 13 only ever *imported* `query`.

### 🧠 `lib/auth.js` — the rules of identity. EXTEND, NEVER REWRITE
Existed as a small stub from 01-P0; Feature 13 **appended** to it. Imports only
`jose`, which keeps it **Edge-safe** — that is what lets `proxy.js` use it. If you
ever `import { query }` here, `proxy.js` breaks instantly. Don't.

Exports:

| Export | What it does |
|---|---|
| `COOKIE_NAME` = `"session"` | The session cookie's name. Never hardcode the string elsewhere. |
| `VALID_ROLES` | The four allowed roles. |
| `AuthError` | Error class carrying an HTTP `status`. |
| `getSession(request)` | Reads the cookie, verifies the signature, returns `{profileId, role, branchId, epoch, issuedAt}` or `null`. **Never throws.** Logs `[auth] rejected session cookie:`. |
| `getSessionUser` | Alias of `getSession`. |
| `requireRole(user, roles)` | Throws `AuthError(403)` unless the role matches. |
| `SESSION_DAYS` | `{admin:30, teacher:100, parent:100, bus:100}` |
| `REFRESH_AFTER_DAYS` = 10 | Sliding-renewal threshold. |
| `sessionDaysForRole(role)` | Lookup helper. |
| `createSessionToken({profileId, role, branchId, epoch})` | Signs the HS256 JWT. |
| `sessionCookieOptions(role)` | httpOnly / lax / secure / maxAge (B4). |
| `clearedSessionCookieOptions()` | Same options with an immediate expiry — how logout works. |
| `shouldRefreshSession(session)` | True once 10 days are used. |
| `isPasswordExpired(role, passwordChangedAt)` | Admin-only 30-day rule; NULL counts as expired. |
| `ADMIN_PASSWORD_MAX_AGE_DAYS` = 30 | |
| `RESET_COOKIE` = `"reset"`, `RESET_TOKEN_MINUTES` = 10 | The reset ticket. |
| `createResetToken(profileId)` / `verifyResetToken(token)` / `resetCookieOptions()` | Mint, check and set that ticket. |
| `readCookie(request, name)` / `getCookieValue(request, name)` | Cookie readers for the two different request shapes Next.js hands us. |
| `PASSWORD_MIN_LENGTH` = 8, `PASSWORD_MAX_BYTES` = 72 | |
| `validatePassword(password, { phoneNumber })` | **The single source of truth for password rules.** Returns the first error message or null. Never re-implement these checks in a route. |

### 🗄️ `lib/repos/authRepo.js` — all auth SQL. ADD TO IT, DON'T CLONE IT
The only file with auth SQL. Every query is parameterized (`$1, $2`). Selects
alias snake_case to camelCase via `PROFILE_AUTH_FIELDS`, so JavaScript never sees
`full_name`.

Constants: `MAX_FAILED_LOGINS` 5 · `LOCKOUT_MINUTES` 15 · `OTP_TTL_MINUTES` 5 ·
`OTP_MAX_ATTEMPTS` 5 · `OTP_MAX_PER_YEAR` 30 · `OTP_COOLDOWN_SECONDS` 45.

Functions: `findAuthProfileByPhone` · `findAuthProfileById` · `getSessionEpoch` ·
`registerFailedLogin` (returns `{failedLoginAttempts, lockedUntil, justLocked}`) ·
`registerSuccessfulLogin` · `setPassword` (hash + `password_changed_at=now()` +
`must_change_password=false` + `session_epoch+1` + clears lockout, all in one
statement) · `bumpSessionEpoch` · `requirePasswordChange` · `countOtpsInLastYear` ·
`createOtp` (**the only place older codes are retired**) · `findRedeemableOtp` ·
`incrementOtpAttempts` · `consumeOtp` · `otpCooldownRemaining`.

⚠️ **`pg` returns `BIGINT` as a JavaScript string.** `profile.id` is `"1266"`, not
`1266`. Wrap it in `Number()` before sending it to a client. This regression bit us
once already.

### 🗄️ `lib/audit.js` — the only writer of `audit_logs`
Built during Feature 13 even though the master plan assigned it to Feature 14,
because login auditing was needed on day one. **Features 01, 04, 07, 08, 11, 12
and 14 must import this file, never recreate it.**

Signature: `logAudit(entry, client = null)`. The optional second argument is a
transaction client, so an audit row can be written inside the same transaction as
the thing it records (Feature 04 will need that). `AUDIT_ACTIONS` is the closed
list of legal action strings.

### 🧠🗄️ `lib/mailer.js` — email delivery
`MAIL_PROVIDER` = `console` | `gmail` | `smtp`. `sendMail({to, subject, text, html})`
returns `{delivered, provider, messageId}` and **never throws** — a dead mail
server must not turn into a 500 on the user's screen. Transport cached on
`globalThis.__schoolAppMailer`. `console` mode prints a banner
`========== EMAIL (console provider) ==========` to the dev terminal, which is how
every OTP test was done. Real delivery verified through Gmail with an App Password.

### 🧠🗄️ `lib/sms.js` — SMS delivery
Mirrors `mailer.js` exactly on purpose. `SMS_PROVIDER` = `console` | `msg91`.
`sendSms({to, message})` → `{delivered, provider}`, never throws. **The `msg91`
branch is a stub** — real SMS needs TRAI DLT. `console` prints
`========== SMS (console provider) ==========`.

## D2. The gate — `proxy.js` (project root)

🗄️ **Next.js 16 calls this file `proxy.js` and its exported function `proxy`.**
A file named `middleware.js` is **silently ignored** on Next 16 — no error, no
warning, every route quietly unprotected. We hit this exact bug. Never rename it back.

Runs on the **Edge** before every matching request. Imports `getSession` from
`lib/auth.js` and nothing else.


const PUBLIC_PAGES = new Set(["/login", "/forgot-password"]);
const PUBLIC_APIS  = new Set(["/api/health", "/api/auth/login", "/api/auth/logout",
"/api/auth/otp/send", "/api/auth/otp/verify",
"/api/auth/reset-password"]);
const ROLE_PREFIXES = [
{ prefix: "/admin",   roles: ["admin"]   },
{ prefix: "/teacher", roles: ["teacher"] },
{ prefix: "/parent",  roles: ["parent"]  },
{ prefix: "/bus",     roles: ["bus"]     },
];



**Default-deny**: anything not listed above requires a session. Order of decisions:
public API → public page (a signed-in visitor to `/login` is bounced to `/`) →
require a session (API answers `401 {"ok":false,"error":"Not signed in"}`, a page
redirects to `/login`) → role prefix gate (API `403`, page redirect to `/`).

`/api/auth/change-password` is deliberately **not** public — you must be signed in
to use it. `/first-login` also requires a session.

The `matcher` config skips `_next/static`, images, fonts, CSS and JS so static
files aren't taxed. Confirmation it's alive: every dev-server request line prints
`proxy.ts: NNNms`.

## D3. Pages and layout — `app/`

### ⚙️🎨 `app/globals.css`
The **entire** design system: `@theme` tokens for both themes plus the shared
classes `.card`, `.pill`, `.cta`, `.field`, `.label-micro`. Tailwind v4 is
CSS-first — **there is no `tailwind.config.js` and you must not create one.**
Never hardcode a colour in a component; use the tokens.

### 🎨 `app/layout.js`
Wraps every page. Sets `<html data-theme>`, real metadata (the `create-next-app`
title and the Geist font imports were removed), and contains an **inline
pre-paint script** that reads `localStorage('theme')` before the first paint so a
dark-mode user never sees a white flash. Dark is the default.

### 🎨 `components/ThemeToggle.js`
`"use client"`. Flips `data-theme` on `<html>` and saves the choice. Nothing to do
with auth; part of the app shell built in Task 1.

### 🎨🧠 `app/page.js` — the home page AND the enforcement point
A **server component**, and the most important non-auth file in the feature. Order
of operations:

1. `const cookieStore = await cookies(); const session = await getSession({ cookies: cookieStore })`
2. No session → `redirect("/login")`
3. `findAuthProfileById(session.profileId)`; no profile → `redirect("/login")`
4. **`session.epoch !== profile.sessionEpoch` → `redirect("/login")`** ← the kill
   switch actually firing (`proxy.js` can't do this — B6)
5. `profile.mustChangePassword || isPasswordExpired(role, passwordChangedAt)` →
   `redirect("/first-login")` ← what makes rotation binding
6. Otherwise render the signed-in card: `label-micro` SIGNED IN, the person's name,
   a role `.pill`, their phone, and `<LogoutButton />`.

`ROLE_LABEL = {admin:"Administrator", teacher:"Teacher", parent:"Parent", bus:"Bus staff"}`.

**Note the deliberate architecture exception:** this page reads the database
directly through a repo function instead of calling `/api/*`. Allowed because it's
a **read** in a server component and saves a whole HTTP round trip on a slow
phone. Writes still always go through API routes.

### 🎨 `app/login/page.js`
Thin server component; renders `<LoginForm />`. Holds the page's metadata.

### 🎨 `components/auth/LoginForm.js`
`"use client"`. Phone + password, POSTs `/api/auth/login`, shows one error line,
disables the button while busy, then navigates using the `redirectTo` the server
sent back.

### 🎨 `components/auth/PasswordField.js`
`"use client"`. Label + input + show/hide eye. Used by the login form, the
forgot-password screen and the first-login screen — three places, one component,
zero duplicated markup. **Reuse this for any future password input.**

### 🎨 `components/auth/OtpInput.js`
`"use client"`. Six boxes with auto-advance, backspace-to-previous, and full
support for **pasting** all six digits at once (a 6-character paste fills forward
instead of landing in one box). `inputMode="numeric"` — not `type="number"`, which
would add ugly spinners and allow `e` and `-`. `autoComplete="one-time-code"` on
the first box lets iOS/Android offer the code from the notification.

### 🎨 `components/auth/LogoutButton.js`
`"use client"`. POSTs `/api/auth/logout`, then `router.replace("/login")` and
`router.refresh()`. The `refresh()` matters: it throws away the cached server
render so the old page can't be seen with the Back button.

### 🎨🧠 `app/forgot-password/page.js` — one route, three steps
`"use client"`. The whole reset flow is a single page with a `step` state
(`"phone"` → `"code"` → `"password"` → `"done"`) rather than three URLs, because
each step depends on a short-lived cookie from the previous one — separate URLs
would let people arrive in the middle with nothing valid.

Also owns the cooldown UI: `CLIENT_COOLDOWN_SECONDS = 60`, key
`COOLDOWN_KEY = "otpCooldown"` in `localStorage` holding an **absolute deadline**,
a 1-second tick, and a mount-time restore so **F5 keeps the countdown**.
`coolingDown = secondsLeft > 0 && phoneNumber === lastSentTo` — the timer belongs
to the number it was started for. Buttons read `Send code` / `Wait 0:47` and
`Send a new code` / `New code in 0:47`, with `Change number` and
`Use SMS instead` / `Use email instead` always available.

### 🎨 `app/first-login/page.js`
`"use client"`. Three `PasswordField`s (current, new, confirm) posting to
`/api/auth/change-password`. Any 401 **other than** "Your current password is
incorrect" is treated as a dead session and sends you to `/login`. Footer warns:
*"Changing your password signs you out on your other devices."*

## D4. The endpoints — `app/api/auth/`

All six follow the house shape: `{ ok: true, data }` or `{ ok: false, error }`.

- **`login/route.js`** — POST. Validates `/^\d{10}$/`, rejects an empty password,
  looks up the profile, burns time on `DUMMY_HASH` if absent, honours a live
  lockout with 423, compares with bcryptjs, on failure calls `registerFailedLogin`
  (+ `auth.lockout` audit when it just locked), on success calls
  `registerSuccessfulLogin`, writes `auth.admin_login` **for admins only**, mints
  the token, sets the cookie, returns
  `{profileId: Number(profile.id), role, fullName, mustChangePassword, redirectTo}`.
- **`logout/route.js`** — POST only. Clears the cookie via
  `clearedSessionCookieOptions()`. **Does not bump the epoch** — other devices stay
  signed in (B6). Returns `redirectTo: "/login"`.
- **`otp/send/route.js`** — POST. Builds one `identicalResponse` object first, then:
  shape check → profile lookup → dummy hash if unknown → **cooldown** → yearly
  quota → `createOtp` → `sendMail` or `sendSms`. Subject *"Greenwood School
  verification code"*. `useEmail = requestedChannel === "email" && Boolean(profile.email)`,
  and the reply **echoes the requested channel**, not the one actually used —
  otherwise the response would reveal whether we hold an email address for that
  family.
- **`otp/verify/route.js`** — POST. Finds the redeemable code, compares hashes,
  increments `attempts` on a miss, calls `consumeOtp` **before** minting anything,
  sets the 10-minute `reset` cookie, returns `{verified:true}`.
- **`reset-password/route.js`** — POST. Trusts **only** the `reset` cookie. Runs
  `validatePassword`, blocks reuse of the current password, calls `setPassword`
  (which bumps the epoch), then clears **both** the `reset` and `session` cookies.
  Returns `redirectTo: "/login"` — you must sign in with the new password, which
  proves you know it.
- **`change-password/route.js`** — POST, signed-in only. Demands the **current**
  password even though you have a session (a borrowed phone shouldn't be able to
  change the password). Re-checks the epoch against the database, calls
  `setPassword`, then **re-mints this device's cookie at the new epoch** so you stay
  in while every other device drops out. Returns `redirectTo: "/"`.

## D5. Files Feature 13 touched but does not own

| File | Relationship |
|---|---|
| `lib/db.js` | Imported only. Frozen. |
| `db/schema.sql`, `db/seed.sql` | Never edited. Changes go in `db/migrations/`. |
| `app/api/health/route.js` | Untouched, still public. |
| `app/api/branches`, `app/api/classes` | Untouched, but **now require a session** because `proxy.js` is default-deny. Feature 01 needs to know. |
| `.env.local` | You maintain it. Feature 13 added `MAIL_*`. Never committed. Restart `npm run dev` after every edit. |
| `.vscode/settings.json` | Added so the CSS linter stops complaining about Tailwind v4's `@theme`. |

---

# PART E — Every route

## Pages

| URL | File | Who can open it | What it does |
|---|---|---|---|
| `/` | `app/page.js` | Signed in (any role) | Signed-in home. Also the epoch check and the forced-password-change gate. |
| `/login` | `app/login/page.js` | **Public.** Signed-in visitors bounce to `/`. | Phone + password. |
| `/forgot-password` | `app/forgot-password/page.js` | **Public** | The 3-step reset. |
| `/first-login` | `app/first-login/page.js` | Signed in | Forced password change. |
| `/admin/*`, `/teacher/*`, `/parent/*`, `/bus/*` | **do not exist yet** | Guarded by role in `proxy.js` already | Later features. A signed-in admin visiting `/admin` correctly passes the gate and then gets a Next.js 404 — expected, not a bug. |

## APIs

| Method + URL | Public? | Success | Notable failures |
|---|---|---|---|
| `POST /api/auth/login` | Yes | 200 `{profileId, role, fullName, mustChangePassword, redirectTo}` + `session` cookie | 401 identical for unknown/wrong · 423 locked · 400 shape |
| `POST /api/auth/logout` | Yes | 200 `{redirectTo:"/login"}`, cookie cleared | — |
| `POST /api/auth/otp/send` | Yes | **Always** 200 `{message, channel, expiresInMinutes}` | 400 shape only |
| `POST /api/auth/otp/verify` | Yes | 200 `{verified:true}` + `reset` cookie | 400 one generic message · 400 "Enter the 6-digit code" |
| `POST /api/auth/reset-password` | Yes (guarded by the `reset` cookie) | 200 `{redirectTo:"/login"}`, all cookies cleared | 401 no/expired ticket · 400 policy · 400 mismatch · 400 reuse |
| `POST /api/auth/change-password` | **No — session required** | 200 `{redirectTo:"/"}`, cookie re-minted | 401 not signed in · 401 wrong current · 401 session ended |
| `GET /api/health` | Yes | `{"ok":true,"students":400}` | — |
| `GET /api/branches`, `/api/classes` | **No** (changed by Feature 13) | Feature 01 payloads | 401 "Not signed in" |

---

# PART F — The five journeys

## F1. Normal login
1. `/login` → type phone + password → **Sign in**.
2. `LoginForm` POSTs `/api/auth/login`.
3. Route validates → looks up → compares hash → resets the failure counter →
   audits if admin → mints the JWT with the profile's current epoch → sets the
   `session` cookie.
4. Response carries `redirectTo`; the form calls `router.replace(redirectTo)`.
5. `/` renders as a server component: `proxy.js` lets it through (cookie valid),
   then the page re-checks the epoch and the password-age gate, then draws the card.

## F2. Logout
**Sign out** → POST `/api/auth/logout` → cookie cleared →
`router.replace("/login")` + `router.refresh()`. Other devices unaffected.

## F3. Forgot password (the long one)
1. `/forgot-password`, step `phone`: enter the number, channel defaults to email.
2. POST `otp/send`. Cooldown → quota → `createOtp` (retiring older codes) →
   email/SMS. Reply is always the same 200. The UI advances to step `code` **even
   for a number that doesn't exist**, so watchers learn nothing, and starts the
   60-second countdown (persisted to `localStorage`).
3. Step `code`: 6 boxes → POST `otp/verify` → hash compared → `consumeOtp` → the
   10-minute `reset` cookie is set.
4. Step `password`: new + confirm → POST `reset-password`, which trusts only that
   cookie → `validatePassword` → reuse check → `setPassword` (**epoch +1**) → both
   cookies cleared.
5. Step `done`: "PASSWORD CHANGED" and a `<Link href="/login">`. Every device,
   including this one, must sign in again.

## F4. First login / forced change
1. Sign in with the temporary password. The profile has
   `must_change_password = true`.
2. `/` sees the flag and redirects to `/first-login`.
3. Current + new + confirm → POST `change-password`. Current password re-verified,
   epoch re-checked against the DB, `setPassword` bumps the epoch, **this** cookie
   is re-minted.
4. `setPassword` also clears `must_change_password`, so `/` no longer redirects —
   no loop.

## F5. Admin 30-day rotation
Same as F4, triggered instead by `isPasswordExpired('admin', password_changed_at)`
on the home page. `password_changed_at` is refreshed by `setPassword`, so the clock
restarts automatically.

---

# PART G — Navigation: what actually opens a new page

Five different mechanisms, and knowing which is which saves hours:

| Mechanism | Written as | Runs where | Used in Feature 13 for |
|---|---|---|---|
| **Server redirect** | `redirect("/login")` from `next/navigation` | Server, during render. Nothing is sent to the browser first. | `app/page.js`: no session, no profile, epoch mismatch, must-change-password |
| **Proxy redirect** | `NextResponse.redirect(...)` | Edge, before the page renders at all | `proxy.js`: no cookie on a private page → `/login`; signed-in on `/login` → `/`; wrong role → `/` |
| **Client replace** | `router.replace(url)` from `useRouter` | Browser, after a fetch | After login, after logout, after a dead session on `/first-login` |
| **Link click** | `<Link href="/login">` | Browser | "Forgot password?" on the login screen; "Go to sign in" on the done panel |
| **Server-chosen target** | the `redirectTo` string inside the API's JSON | Decided on the server, obeyed by the client | `login` → `/`, `logout` → `/login`, `reset-password` → `/login`, `change-password` → `/` |

Two things worth internalising:

- **`router.replace` vs `router.push`.** `replace` overwrites the current history
  entry; `push` adds one. We use `replace` after login and logout so the Back
  button cannot return to a login form you already used or a page you've just been
  signed out of.
- **`redirectTo` comes from the server on purpose.** The client doesn't decide
  where a successful login lands. When role dashboards arrive, the login route
  starts returning `/admin` or `/parent` and **no UI file changes at all**.
  Extension point — use it.

---

# PART H — Security, layer by layer

Seven layers. Any one of them failing does not open the door.

1. **Transport** — `secure` cookies in production; HTTPS terminates at the VPS.
2. **The proxy (Edge)** — default-deny. Signature + expiry + role prefix. Cheap,
   runs before everything, cannot touch the DB.
3. **Cookie hardening** — `httpOnly` (page scripts can't read it), `sameSite=lax`
   (kills CSRF on POSTs), `path=/`, bounded `maxAge`.
4. **Token integrity** — HS256 over `JWT_SECRET`. Editing any claim invalidates
   the signature. `getSession` returns `null` instead of throwing, so a tampered
   cookie is simply "not signed in".
5. **Server-side revocation** — `session_epoch`, checked in Node on the home page
   and on change-password. Beats the classic "JWTs can't be revoked" problem.
6. **Credential handling** — bcryptjs cost 10; 72-byte ceiling; a dummy hash for
   unknown accounts to equalise timing; 5-strike lockout with a 15-minute freeze;
   `validatePassword` as the single policy source; reuse of the current password
   blocked.
7. **Information hiding** — byte-identical responses and matched timings for
   login and OTP send; one generic OTP verify error; the channel echoed rather
   than reported; OTPs stored only as hashes; single-use codes with an attempt
   counter and a 5-minute life; the reset ticket a separate 10-minute cookie that
   trusts no request body.

Plus: all SQL parameterized inside `lib/repos/` (no SQL injection surface), and
admin logins and lockouts recorded in `audit_logs`.

**Known accepted weaknesses — documented, not accidental:**
- The 423 lockout message admits an account exists (B7). Accepted for usability.
- Gmail with an App Password is fine for development, **not** production. A real
  domain and a transactional provider are needed before launch.
- SMS is `console` only. Real SMS is blocked on TRAI DLT registration.
- No CAPTCHA and no IP-based throttling. Lockout is per account, so a spray attack
  across many numbers isn't slowed down. Note it as a future item.

---

# PART I — Rules for the next AI chat / the next feature

**READ THIS BEFORE WRITING A LINE OF AUTH-ADJACENT CODE.** Each rule exists
because ignoring it costs a rewrite.

### These files already exist. Import them. Never recreate them.

| Need | Use | Never do this |
|---|---|---|
| Run SQL | `import { query, withTransaction } from "@/lib/db"` | `new Pool(...)` anywhere |
| Auth SQL | add a function to `lib/repos/authRepo.js` | a second auth repo, or SQL in a route |
| Who is signed in? | `getSession` from `@/lib/auth` | decoding the cookie by hand |
| Role check | `requireRole(user, ["admin"])` | comparing role strings inline |
| Hash a password | `bcryptjs` (cost 10) | native `bcrypt`, `crypto.createHash`, "bcrypt.js" |
| Password rules | `validatePassword()` from `@/lib/auth` | re-typing the rules in a route |
| Protect a route | add a rule to `proxy.js` | a new middleware/proxy file |
| Audit trail | `logAudit(entry, client)` from `@/lib/audit` | inserting into `audit_logs` yourself |
| Send email | `sendMail()` from `@/lib/mailer` | importing `nodemailer` again |
| Send SMS | `sendSms()` from `@/lib/sms` | a second SMS wrapper |
| Password input | `components/auth/PasswordField.js` | a fresh `<input type="password">` |
| Code input | `components/auth/OtpInput.js` | another 6-box component |
| Sign out button | `components/auth/LogoutButton.js` | another one |
| Colours / cards / buttons | tokens and `.card` / `.cta` / `.pill` / `.field` / `.label-micro` in `app/globals.css` | hex codes in components; a `tailwind.config.js` |

### Hard rules

1. **The file is `proxy.js`, not `middleware.js`.** Next 16 renamed the convention
   and silently ignores the old name — you get no error, just an unprotected app.
2. **Never `import { query }` into `lib/auth.js`.** It must stay Edge-safe or
   `proxy.js` dies.
3. **Never do a `session_epoch` check inside `proxy.js`.** Edge has no database.
   Do it in the Node page or route.
4. **No `CREATE`/`ALTER`/`DROP` in application code.** Schema changes are numbered
   files in `db/migrations/`. `002` is taken by Feature 13; `001_v1_1.sql` is
   reserved for Feature 14. **Never edit `db/schema.sql` or `db/seed.sql`.**
5. **`pg` returns BIGINT as a string.** `Number(profile.id)` before it reaches a
   client.
6. **Every new page under `/admin`, `/teacher`, `/parent`, `/bus` is automatically
   role-gated** by the existing prefixes. Don't re-check the role in the page
   unless you need finer rules (e.g. "this teacher's own class only").
7. **Every new API route is private by default.** To make one public you must add
   it to `PUBLIC_APIS` in `proxy.js` — and justify it.
8. **Never invent an audit action.** Use one from `AUDIT_ACTIONS`, or add it there
   deliberately.
9. **Never change an auth error message** without checking Part B8 first. Several
   are deliberately identical to each other.
10. **A new `app/api/<folder>` needs `.next` deleted** and `npm run dev` restarted;
    Turbopack caches its route table and will 404 a brand-new route folder. Editing
    an existing file is fine.
11. **Restart the dev server after every `.env.local` change.**
12. **Do not `npm audit fix --force`.** There are 4 known high-severity advisories
    in transitive dev dependencies; forcing fixes would upgrade Next.js itself.
13. **Ask before adding any npm package.** Current auth-related deps: `bcryptjs`,
    `jose`, `nodemailer`, `pg`.

### If you are told "the user can't log in"

Check in this order:
1. Is `proxy.js` printing `proxy.ts: NNNms` in the dev terminal? If not, the file
   isn't being loaded — check the name and the exported function name.
2. `SELECT phone_number, failed_login_attempts, locked_until, session_epoch,
   must_change_password, password_changed_at FROM profiles WHERE phone_number='...';`
   — locked out? epoch bumped? forced change pending?
3. Is `JWT_SECRET` still the same value? Changing it invalidates every existing
   token at once.
4. Admin only: is `password_changed_at` older than 30 days? That's a redirect to
   `/first-login`, not a failure.

### Test accounts

Seed logins are `Pass@123`. Admin `9000000001`; teachers `9000000101`–`9000000120`;
parents `9810000001`–`9810000400`; buses `9000000021`, `9000000022`.
Only staff rows have email addresses, at the **undeliverable** `@greenwood.test`
domain; admin `9000000001` was pointed at a real inbox for testing. Parents have no
email, so they fall back to the SMS box in the dev terminal.

⚠️ **Testing OTPs spends the real 30-per-year quota.** Clean up after a test run:
DELETE FROM otp_codes WHERE phone_number='9000000001';



### Verified by manual testing (2026-08-03 → 2026-08-05)

Admin and teacher login with correct session lengths (30 vs 100 days, checked on
the cookie's expiry date) · wrong password and unknown phone returning identical
401s · 5 failures → 423, and 423 again with the *correct* password while locked ·
`auth.lockout` and `auth.admin_login` rows in `audit_logs` · logout clearing one
device only · `session_epoch` bump signing the browser out on the next refresh ·
`proxy.js` sending anonymous visitors to `/login` and 401-ing `/api/branches` ·
real email delivered through Gmail · OTP send/verify, replay rejected, 5 wrong
guesses exhausted · all four password-policy messages · reset invalidating the old
password and enabling the new one · change-password keeping this device and
kicking others · the cooldown refusing silently (row count `10 → 11 → 11`, 22ms
vs 584ms) and reopening after 50s, with the existing code still verifying `200`.

### Known dead code — leave it

`validatePassword`'s *"Password cannot be your phone number"* rule is
**unreachable**: a 10-digit phone number trips *"must include at least one letter"*
first. Proved live. Kept as defence in depth in case the letter rule ever changes.

Also unused: `otp_codes.purpose = 'first_login'`. The schema allows it and
`otp/send` accepts it, but `/first-login` uses the signed-in change-password route
instead, so only `'reset'` is ever written today.

### Still open at the end of Feature 13

- No role dashboards (`/admin`, `/teacher`, `/parent`, `/bus`) — later features.
- `app/layout.js` has no session-aware navigation yet.
- Real SMS blocked on TRAI DLT; production email needs a proper provider.
- No CAPTCHA / IP throttling.
- Possible upgrade: escalating OTP backoff (30s → 60s → 5min).