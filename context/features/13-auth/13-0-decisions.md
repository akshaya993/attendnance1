# Feature 13 - Authentication: Locked Decisions

Status: DONE (all tasks tested 2026-08-04/05)
Owner feature: 13 (Login, Sessions, OTP, Password Reset)
Written: 2026-08-01
Read this before touching ANY auth code in any future chat.

Sections 0-12 are the RULES. Section 13 is the BUILD LOG (what happened and
why). Section 14 is what feature 13 owes to later features.

---

## 0. Priority

If anything below conflicts with the feature-13 prompt file, THIS FILE WINS.
The prompt file was written before schema v1.1 and before these decisions.

---

## 1. Database - what we did and did NOT do

- db/schema.sql is FINAL and was NOT edited in feature 13.
- db/seed.sql was NOT edited.
- ONE approved migration was added: db/migrations/002_auth_columns.sql
  It adds exactly two columns to `profiles`:
    - session_epoch       SMALLINT NOT NULL DEFAULT 0
    - password_changed_at TIMESTAMPTZ
  Nothing else. No new tables. No new indexes.
- `otp_codes` and `idx_otp_phone` already existed. Feature 13 only INSERTs
  and SELECTs from them.
- There is no db/migrations/001_v1_1.sql. That number is deliberately reserved
  for feature 14 (year-end promotions). Migrations starting at 002 is correct,
  not a missing file.

## 2. Password hashing - bcryptjs ONLY

- Package: `bcryptjs` (pure JavaScript). Cost factor 10.
- NEVER install or import the native `bcrypt` package. It needs C++ build
  tools on Windows and on the VPS, and breaks on every Node upgrade.
- "bcrypt.js" (with a dot) is not a real npm package. Do not type it.

### The pgcrypto question - settled, do not revisit
db/seed.sql ran `crypt('Pass@123', gen_salt('bf', 10))`. `bf` = Blowfish =
bcrypt. Those seeded hashes are standard `$2a$10$...` bcrypt hashes.
`bcryptjs.compare()` reads them correctly with zero changes.
=> No re-hash. No migration. No data change. Ever.
Postgres was only the seed-time generator. Application code never calls
`crypt()` again; all hashing goes through `bcryptjs.hash(pw, 10)`.

## 3. Sessions - 100-day sliding, with an instant kill switch

- Cookie name: `session`. httpOnly, sameSite=lax, secure in production.
- JWT via `jose`. Payload: { profileId, role, branchId, epoch }.
- Lifetime:
    - parent / teacher / bus : 100 days
    - admin                  : 30 days
  Cookie maxAge always equals JWT expiry.
- Sliding: on a normal request, if more than 10 days of the lifetime have
  been used, re-issue a fresh token. Never re-sign on every request.

### session_epoch - how "log out everywhere" works
Every token carries the user's current `session_epoch`. On password change,
password reset, or an admin forcing a logout, we run:
    UPDATE profiles SET session_epoch = session_epoch + 1 WHERE id = $1;
Every old token now carries a stale epoch and is rejected.

IMPORTANT: proxy.js runs on the Edge runtime and CANNOT use `pg`.
proxy.js checks signature + expiry ONLY. The epoch comparison happens in
Node-side pages and API routes, folded into a `profiles` read they already do.

## 4. Login rules

- Login identifier is the 10-digit phone number. Password is PRIMARY.
- 5 failed attempts  -> `locked_until = now() + 15 minutes`
  (columns failed_login_attempts and locked_until already exist)
- Successful login   -> reset failed_login_attempts to 0, set last_login_at
- Admin logins and all lockouts are audited. Regular user logins are NOT
  (400 parents logging in daily would flood audit_logs for no benefit).
- Anti-enumeration: wrong phone and wrong password return the SAME message
  and the same HTTP status. Never reveal that an account exists.
- ACCEPTED EXCEPTION: the 423 lockout response DOES say "Try again in 15
  minutes". This confirms the account exists. Kept deliberately - a real
  parent needs to know why they cannot get in.

## 5. Admin password rotation - 30 days

- Only role = 'admin'.
- On login, if password_changed_at IS NULL or older than 30 days, the admin
  is redirected to /first-login and cannot use the app until they set a new
  password.
- Changing the password sets password_changed_at = now() and bumps
  session_epoch.
- Non-admin roles are never forced to rotate.

## 6. OTP - one single limit

- 30 OTPs per phone number per ROLLING 365 days. That is the only QUOTA.
  No per-day, per-week or per-month buckets.
- PLUS a resend cooldown (task 9C): 45 seconds minimum between two codes for
  the same phone + purpose, enforced by otpCooldownRemaining() in
  lib/repos/authRepo.js (OTP_COOLDOWN_SECONDS = 45). A refused send returns the
  byte-identical generic 200, writes NO row, spends NO quota, and leaves the
  previous code valid. The UI shows a 60-second countdown
  (CLIENT_COOLDOWN_SECONDS in app/forgot-password/page.js) - deliberately
  LONGER than the server rule, because the server refuses silently.
- Enforced by counting rows, not by counter columns:

    SELECT count(*)::int AS used FROM otp_codes
    WHERE phone_number = $1 AND created_at > now() - interval '365 days';

  Uses the existing index idx_otp_phone (phone_number, created_at DESC).
  Rows ARE the history, so we keep full forensics for free and there is no
  cron job to reset counters and no midnight double-spend race.
- Code: 6 digits from crypto.randomInt (never Math.random), stored ONLY as a
  bcryptjs hash in otp_codes.code_hash.
- Expiry: 5 minutes (expires_at column).
- Wrong guesses: 5 max per code (attempts column), then the code is dead.
- Used codes: consumed_at is stamped; a code can never be reused.
- purpose is 'reset' or 'first_login' only (CHECK constraint). Nothing writes
  'first_login' today - it is reserved.

Cooldown and resend timers ARE implemented (task 9C). DLT registration and real
SMS provider setup are documented in context/13-1-otp-and-auth-spec.md and are
NOT implemented in v1.

## 7. OTP delivery channel

- EMAIL is the default channel for EVERY account and EVERY role.
- A visible "Use phone instead" switch is always shown, identical on every
  screen, for every role.
- Because the screen never changes based on who typed, it leaks nothing.
- The response text is always identical:
      "If an account exists, a code has been sent."
  regardless of whether the phone exists or has an email on file.
- Email sender: nodemailer + Gmail App Password (MAIL_PROVIDER=gmail).
- SMS sender: MUST stay SMS_PROVIDER=console in development. Real SMS in India
  requires TRAI DLT registration and costs ~Rs 0.20 per message. No SMS is
  sent in v1.

## 8. Reset token

After a correct OTP the user is NOT logged in. They receive a separate
short-lived `jose` JWT with { purpose: 'reset', profileId }, 10-minute
expiry, in a temporary httpOnly cookie named `reset`. /api/auth/reset-password
accepts only that cookie, then deletes it. otp_codes.consumed_at is stamped
in the same transaction. No new table: the JWT carries its own expiry.

## 9. Shared files created early - DO NOT RECREATE

### lib/audit.js
OWNER on paper: Feature 14 (Promotions), Prompt 1.
BUILT EARLY in Feature 13, because auth must log 'auth.admin_login' and
'auth.lockout' on day one.
=> Progress tracker row 14-P1 is DONE.
=> Features 01, 04, 07, 08, 11, 12 and 14 must IMPORT lib/audit.js.
   They must NEVER create it again. Feature 14 must SKIP its Prompt 1.

Signature: logAudit(entry, client = null)
  entry = { branchId, actorId, action, entityType, entityId, details }
  Pass the pg client as the SECOND argument when inside a transaction - then a
  failed audit write RE-THROWS and rolls the transaction back.
  Called standalone (no client) it swallows errors on purpose: a failed audit
  row must never break a login.
  NOTE: 00-PROJECT-STRUCTURE.md once documented this as logAudit(client, entry).
  That was corrected. The order above is what the code actually does.

### lib/auth.js
Existed as a partial file from 01-P0 (getSession, getSessionUser,
requireRole, AuthError). Feature 13 APPENDED to it. It was not rewritten.
It imports ONLY `jose` and must stay that way - proxy.js runs on Edge and
cannot load `pg`. Never import bcryptjs or pg into this file.

### proxy.js  (NOT middleware.js - read the warning)
Created by Feature 13, at the project ROOT. Next.js 16 renamed the middleware
file convention to `proxy.js` and the exported function from `middleware` to
`proxy`. A file named middleware.js is SILENTLY IGNORED on Next 16 - no error,
no warning, every route simply unprotected. Never rename it back.
All future features ADD route rules to this file, never replace it.
It is DEFAULT-DENY: anything not in PUBLIC_PAGES or PUBLIC_APIS needs a session.

### lib/mailer.js and lib/sms.js
Created by Feature 13. DELIVERY ONLY - they hold no OTP logic, so the OTP
routes never change when a provider changes. Neither throws on a delivery
failure. Any feature needing email (notifications, admissions, fees) imports
lib/mailer.js.

### lib/repos/authRepo.js
The ONLY file with SQL in feature 13. Login lookup, atomic lockout,
setPassword (bumps session_epoch + stamps password_changed_at in one
statement), and all OTP queries including the 30-per-rolling-year cap.

## 10. New environment variables

Added to .env.local in feature 13:

    JWT_SECRET=<64 random hex chars>
    SMS_PROVIDER=console
    SMS_API_KEY=
    SMS_SENDER_ID=
    SMS_DLT_TEMPLATE_ID=
    MAIL_PROVIDER=gmail
    MAIL_USER=testingprototype3@gmail.com
    MAIL_PASS=<16-char Gmail App Password, no spaces>
    MAIL_FROM=Greenwood School <testingprototype3@gmail.com>

.env.local is NEVER committed and NEVER overwritten by an AI.
The dev server must be RESTARTED after any .env.local edit.

## 11. Packages

Approved and used by feature 13:
    bcryptjs   (already present)
    jose       (already present)
    pg         (already present)
    nodemailer (ADDED in feature 13, Task 7)

No other package may be added without asking.

## 12. UI

The app shell (app/layout.js, app/globals.css) and the light/dark
ThemeToggle were created ONCE here, in feature 13, using the Veritas
Editorial tokens from context/ui-context.md. Dark is the default.
No fonts are downloaded. No feature may hardcode a colour.

---

## 13. Build log - what happened, in order

Append-only. Newest at the bottom. One line per decision, with the reason.
This is the authoritative record. progress-tracker.md holds STATUS only.

### 2026-08-01 to 2026-08-03 (setup)

- Feature 13 started. Every locked decision lives in this file; the feature
  prompt file was written before schema v1.1 and loses any conflict.
- App shell built here, once: app/globals.css holds the real Veritas tokens,
  app/layout.js rewritten (Geist fonts removed, no font downloads),
  components/ThemeToggle.js created. Dark is default.
- db/migrations/002_auth_columns.sql applied: profiles gains session_epoch and
  password_changed_at (backfilled from created_at). schema.sql NOT edited.
  001_v1_1.sql stays reserved for feature 14.
- HASHING: bcryptjs only, cost 10. Never native bcrypt. "bcrypt.js" with a dot
  is not a real package.
- pgcrypto question settled: seeded hashes from crypt(gen_salt('bf',10)) are
  standard $2a$10$ bcrypt and bcryptjs.compare() reads them as-is. No re-hash,
  ever.
- OTP limit: 30 per phone per rolling 365 days, counted from otp_codes rows.
  The rows ARE the history - no counter columns, no cron reset, no midnight
  double-spend race.
- .vscode/settings.json added to silence the false "Unknown at rule @theme"
  warning on Tailwind v4.
- lib/audit.js pulled forward from feature 14 because auth must log
  auth.admin_login and auth.lockout on day one. Signature deviates from the
  planning docs: logAudit(entry, client = null).
- lib/repos/authRepo.js created - the ONLY file with SQL in this feature.
- VERIFIED against db/schema.sql: profiles had no existing equivalent of
  session_epoch or password_changed_at under any name. must_change_password is
  a boolean, not a date, so it cannot drive the 30-day admin rotation.
  Migration 002 was necessary.

### 2026-08-03 (sessions and login)

- lib/auth.js EXTENDED, not rewritten. It imports only `jose` and must stay
  that way - proxy.js runs on Edge and cannot load `pg`.
- Sessions: parent/teacher/bus 100 days, admin 30 days, sliding. Re-issue only
  after 10 days of the lifetime are used, never on every request.
- Logout clears the cookie on THIS device only. It does not bump the epoch,
  because signing a parent out of every device for pressing "sign out" would
  be hostile.
- RULE ADOPTED: if a change needs more than two find-and-replace edits in one
  file, output the complete file instead. Three silent partial edits caused
  "Export COOKIE_NAME doesn't exist" and a 500 on every login.
- Task 4 VERIFIED 7/7: admin and teacher login, wrong password, unknown phone,
  5-strike lockout with 423, correct password while locked still refused,
  logout, and the audit rows for auth.lockout and auth.admin_login.
- `pg` returns BIGINT as a JavaScript STRING. profile.id is "1266". Wrap in
  Number() before sending to a client.

### 2026-08-04 (UI, home, proxy)

- Git incident: a branch checkout removed app/api/auth locally. Recovered with
  `git checkout branches/<branch> -- app/api/auth`. RULE: never run
  `git checkout <branch>` without asking. `git checkout -b <new>` is safe.
- 423 "Try again in 15 minutes" KEPT, with the disclosure trade-off accepted
  in writing: it confirms the account exists, but a real parent needs to know
  why they are locked out.
- Task 5 login UI built: app/login/page.js is a server component holding the
  metadata; components/auth/LoginForm.js is the client component. Small client
  islands, not whole client pages.
- OtpInput deferred to 9B - build a component when its screen exists.
- ANTI-ENUMERATION is byte-identical: same status, same body, same headers for
  a wrong password and an unknown phone. A DUMMY_HASH comparison keeps the
  timing equal too. Consequence for testing: the HTTP response tells you
  nothing; judge behaviour from the dev terminal and the database.
- Task 6 home page: the session_epoch check lives in app/page.js, not in
  proxy.js, because Edge cannot load `pg`. Architectural exception recorded -
  a server component MAY read via a repo; all WRITES still go through /api/*.
- Kill switch VERIFIED: bumping session_epoch in psql logged the browser out
  on the next refresh.
- proxy.js is DEFAULT-DENY. Consequence: /api/branches and /api/classes now
  require a session - they used to be open. Feature 01 must know.
- No `?next=` return-URL parameter. An open redirect parameter is a phishing
  vector and the app has no deep links worth preserving yet.
- CRITICAL: middleware.js is SILENTLY IGNORED on Next.js 16. Renamed to
  proxy.js, function `middleware` -> `proxy`. Confirmed live by `proxy.ts:
  NNNms` in every dev request line. RULE: verify framework file conventions
  in node_modules/next/dist/docs/ before writing one.
- Defence in depth accepted: proxy.js AND app/page.js AND every API route
  each check. Three cheap checks beat one clever one.
- Task 7 VERIFIED: a teacher typing /admin is bounced, /api/branches returns
  401 when signed out, /api/health stays public.
- Task 8A: lib/mailer.js and lib/sms.js are DELIVERY ONLY. They hold no OTP
  logic, so the OTP routes never change when a provider changes.
- Email is the working channel; SMS prints to the terminal. Neither function
  throws on a delivery failure.
- A Gmail App Password is fine for development, not production: ~500
  recipients/day and the sender address is rewritten.
- The temporary /api/dev/mail-test route was DELETED after use.
- TURBOPACK TRAP: a brand-new app/api/<folder> 404s until you delete .next
  and restart. Editing an existing file reloads fine.
- OTP codes come from crypto.randomInt, never Math.random, and are stored only
  as a bcryptjs hash.
- otp/send always returns 200 with the same generic message, with timing
  parity from a dummy-hash path, and echoes the channel the user REQUESTED,
  not the one actually used.
- otp/verify has ONE generic error for wrong, expired, consumed and
  out-of-attempts. consumeOtp runs BEFORE the reset ticket is minted, so a
  failure can never leave a live code.
- The reset ticket is a 10-minute jose JWT in an httpOnly `reset` cookie. No
  new table: the JWT carries its own expiry.
- No audit rows for OTP or password events - one row per reset would be noise.
- Seed staff emails are @greenwood.test, an undeliverable domain. The admin
  row was pointed at a real inbox for testing.
- Task 8B VERIFIED: send, verify, replay rejected, 5 wrong guesses kill the
  code.
- The password policy lives in ONE function, validatePassword(), shared by
  reset-password and change-password. Two copies would drift.
- 72 BYTES, not characters, is bcrypt's real ceiling; measured with
  TextEncoder, not Buffer, so the check works on Edge too.
- reset-password trusts ONLY the reset cookie, never a phone number in the
  body, and logs the user out of EVERY device on success.
- change-password keeps THIS device signed in but demands the current password
  even though the user is already signed in - a borrowed unlocked phone must
  not be able to take over an account.
- Reusing the current password is refused.
- Task 9A VERIFIED: all four policy rejections, a successful reset, the old
  password failing afterwards, and a successful signed-in change.
- KNOWN DEAD RULE, kept as defence in depth: validatePassword's "cannot be
  your phone number" branch is unreachable because "must include at least one
  letter" fires first. Proved live.
- REGRESSION FOUND: the git recovery had reverted Number(profile.id).
  RULE: after any git recovery, re-verify fixes made before it.
- otp-helpers.ps1 added at the project root and git-ignored. PowerShell
  functions live only in the terminal that loaded them: re-load with
  `. .\otp-helpers.ps1` in a SECOND terminal, never the one running the dev
  server. Test helpers must fail LOUDLY - a helper that silently sent an empty
  session produced an indistinguishable 401 and wasted a round of testing.

### 2026-08-05 (reset UI, cooldown, docs)

- /forgot-password is ONE route with three steps (phone -> code -> password)
  because each step depends on a short-lived cookie from the previous one.
- Client components cannot export `metadata`. The interactive reset pages
  therefore have none.
- The code step advances even for an unknown number - stopping there would
  leak which numbers are registered.
- OtpInput accepts a PASTED six-digit code and fills forward. It uses
  inputMode="numeric", not type="number" (no spinners), with
  autoComplete="one-time-code" on the first box so phones offer the code.
- The app/page.js gate is what makes admin rotation binding: without it, an
  expired admin could ignore /first-login.
- /first-login treats any 401 as a dead session and redirects to /login,
  EXCEPT "Your current password is incorrect", which stays on the page.
- setPassword clears must_change_password in the same statement, so there is
  no redirect loop.
- Task 9B VERIFIED end to end in the browser.
- Unthrottled resend could burn a third of a user's yearly allowance in a
  minute, and once SMS is live it is a real bill. The named attack is SMS
  pumping.
- OTP_COOLDOWN_SECONDS = 45 server-side via otpCooldownRemaining().
  CLIENT_COOLDOWN_SECONDS = 60 in the browser, deliberately longer.
- A cooldown hit never reaches createOtp: no row, no quota consumed, previous
  code still valid, byte-identical generic 200.
- Elapsed time is computed in SQL, from created_at, so the DATABASE clock
  decides. No schema change was needed - created_at plus idx_otp_phone are
  enough.
- The countdown deadline is stored in localStorage as an ABSOLUTE timestamp.
  React state alone meant F5 re-enabled the button while the server still
  refused. Theme and this deadline are the only two things allowed in
  localStorage. Never a token.
- The countdown is keyed to the phone number it was started for, so switching
  numbers does not inherit someone else's wait.
- Task 9C VERIFIED 2026-08-05 on ten points, including allowance protected
  (8->9), refusal writes nothing (10->11->11), the window reopening after 50 s
  (11->12), other numbers unaffected, and an existing code surviving a refusal.
- A refusal costs 22 ms; a real send costs 163-584 ms.
- Testing burns the real 30-per-year allowance. The test rows were deleted
  afterwards with DELETE FROM otp_codes WHERE phone_number = '...'.
- Read-Host labels must be a single noun. A label that looked substitutable
  ("993783") was typed as the prompt and the code came through empty.
- Never issue a test command containing a placeholder the user must hand-edit.
  Use $code = Read-Host "code". This was broken twice.
- Documentation set written: 13-1-otp-and-auth-spec.md (delivery, DLT, costs,
  runbooks), 13-2-feature-13-reference.md (how auth works, file by file), and
  00-MASTER-REFERENCE.md (the whole project, so a new chat imports instead of
  rebuilding).
- ALL TEST ACCOUNTS reset to Pass@123 at the end of feature 13 - one SQL
  statement that also clears lockouts and bumps session_epoch. Note that it
  restarts every admin's 30-day rotation clock. No code changed.

### 2026-08-06 (documentation audit)

- Full repo scan run against the pushed branch. Six documentation
  contradictions found and fixed: the three 13-* docs had been moved out of
  context/ (breaking two hardcoded references in lib/sms.js); the build order
  still told feature 04 to create lib/audit.js; README named a file that never
  existed (13-3-file-map-and-flows.md); the iron rules were labelled 12 but
  numbered to 15; ai-workflow-rules said "6 context files" when there are 12;
  and 00-MASTER-REFERENCE.md was listed nowhere.
- This build log had been pasted into progress-tracker.md by mistake. Moved
  here. progress-tracker.md is now STATUS ONLY. Rule: status goes in the
  tracker, reasoning goes in the feature's decisions file.
- A stray "### middleware.js" heading was still sitting above "### proxy.js"
  in section 9 of this file. Removed - a future AI skimming headings would
  have recreated the silently-ignored file.
- Section 9 documented logAudit as logAudit({...}) with no client parameter,
  contradicting the real code and the tracker. Corrected.

---

## 14. What feature 13 owes later features

Each item is blocked on a feature that does not exist yet. Do not try to
solve them inside auth.

1. **lib/guard.js - HIGHEST PRIORITY, do this first in feature 09.**
   must_change_password is enforced in app/page.js, not proxy.js, because Edge
   cannot reach PostgreSQL. It therefore guards ONLY "/". The moment a second
   page exists, a flagged user can navigate straight past the forced password
   change. Extract the check into lib/guard.js as requireActiveSession() and
   call it as the first line of every server page.
2. **Bus role caging** -> feature 02. role='bus' must be restricted to the
   location-ping scope. Today it gets an ordinary 100-day session.
3. **Bus login redirect target** -> feature 02. A bus login currently lands on
   "/" like everyone else.
4. **proxy.js ROLE_PREFIXES** covers only /admin /teacher /parent /bus. Add a
   row as each feature adds routes. Never replace the file.
5. **Profile "Change Password" button** -> feature 11. /api/auth/change-password
   works and is tested; nothing in the UI calls it yet.
6. **No `?next=` return-to-page parameter.** Deliberate. Revisit only when the
   app has deep links worth preserving, and validate the target is a relative
   path if you ever add it.