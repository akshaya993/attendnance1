# PROGRESS TRACKER
## School App - Live Build Status

> CONTEXT FILE 6 of 6. UPDATE THIS AFTER EVERY COMPLETED PROMPT.
> This file is the single source of truth for 'where are we?'.

## Environment (all verified working)

- [x] PostgreSQL 16 on Windows, port 5432, service postgresql-x64-16
- [x] Database `school`, app user `school_app` (dev password - rotate before prod)
- [x] Schema loaded: 43 tables + 25 indexes
- [x] Seed data loaded: 1 branch, 16 classes (1-7 A; 8/9/10 A/B/C), 400 students,
      400 parents, 20 teachers, 2 buses, full fees/marks/attendance/timetable/chat
- [x] Node.js v22.20.0
- [x] Next.js app created at C:\projects\school-app (JS, Tailwind, ESLint,
      App Router, no src/, no React Compiler, AGENTS.md included)
- [x] pg + bcryptjs + jose installed
- [x] .env.local with DATABASE_URL + JWT_SECRET
- [x] Health check /api/health -> {"ok":true,"students":400}
- [x] db/ folder in project with schema.sql + seed.sql reference copies
- [x] 7 context files placed in project /context folder
- [x] nodemailer installed; MAIL_* in .env.local; Gmail App Password delivery verified 
- [x] db/migrations/002_auth_columns.sql applied.

## Seed logins (password for all: Pass@123)

admin 9000000001 | teachers 9000000101-120 | parents 9810000001-400 |
buses 9000000021/22. All fake - replace before production.

## Feature status

| # | Feature | Status | Notes |
|---|---|---|---|
| 01-P0 | Project skeleton (lib/db.js, auth stub, branches/classes APIs) | DONE | lib/db.js, lib/auth.js stub, app/api/branches, app/api/classes, app/api/health all present. branches/classes now require a session (proxy.js default-deny) |
| 13 | Auth, OTP, proxy.js, real lib/auth.js | DONE (tested 2026-08-05) | Tasks 0-9C all tested. Login+lockout+audit, 100/30-day sliding sessions, session_epoch kill switch, proxy.js role gates, email OTP via nodemailer/Gmail, reset + forced change, password policy, 45s OTP cooldown. Docs: 13-0-decisions.md, 13-1-otp-and-auth-spec.md, 13-2-explanation.md, 13-3-file-map-and-flows.md |
| 09 | Notifications + lib/notify.js + PWA files | not started | |
| 01 | Attendance (rest) | not started | |
| 14-P1 | lib/audit.js ONLY (needed by 04) | DONE - built during feature 13 | auth needs it for auth.admin_login / auth.lockout. Features 01/04/07/08/11/12/14 must IMPORT it, never recreate |
| 04 | Fees | not started | |
| 05 | Groups/chat | not started | |
| 07 | Marks | not started | |
| 10 | Timetable | not started | |
| 02 | Bus tracking + busAlarmWorker | not started | |
| 03 | Complaints & feedback + lib/ai.js | not started | |
| 06 | Leaves | not started | |
| 08 | Admissions | not started | |
| 12 | Posts | not started | |
| 14 | Promotions & year-end (rest) + feeReminders worker | not started | |
| 11 | Profiles & privacy | not started | |
| - | Deployment (VPS, pm2, nginx, HTTPS, backups) | not started | see checklist below |

## How to update this file (AI: do this every time)

After each completed prompt, change the feature row's Status to one of:
in progress / built - needs manual test / DONE (tested <date>). Add one-line notes
for anything the next session must know (bugs found, TODOs, deviations).

## Known issues / decisions log





- 2026-08-03 - Feature 13 started. ALL locked decisions live in
  context/13-0-decisions.md. Read that file before touching any auth code.
- 2026-08-03 - App shell built in feature 13: app/globals.css now holds the real
  Veritas tokens from ui-context.md, app/layout.js rewritten (Geist fonts removed,
  no font downloads), components/ folder created with ThemeToggle.js. Dark is
  default. Never hardcode a colour; use bg-page / bg-surface / text-body etc.
- 2026-08-03 - db/migrations/002_auth_columns.sql applied: profiles gains
  session_epoch SMALLINT NOT NULL DEFAULT 0 and password_changed_at TIMESTAMPTZ
  (backfilled from created_at). db/schema.sql was NOT edited. 001_v1_1.sql stays
  reserved for feature 14.
- 2026-08-03 - HASHING RULE: bcryptjs ONLY, cost 10. Never install native bcrypt.
  Seeded hashes came from Postgres crypt(gen_salt('bf',10)) = standard $2a$10$
  bcrypt, and bcryptjs.compare() reads them as-is. No re-hash needed, ever.
- 2026-08-03 - OTP limit: 30 per phone per rolling 365 days, counted from
  otp_codes rows. No counter columns, no per-day/week buckets.
- 2026-08-03 - .vscode/settings.json added to silence VS Code's false
  "Unknown at rule @theme" warning on Tailwind v4 syntax.
- 2026-08-03 - lib/audit.js created in feature 13 (pulled forward from 14-P1).
  Signature is logAudit(entry, client=null), NOT logAudit(client, entry) as
  written in 00-PROJECT-STRUCTURE.md. That doc is corrected in task 11.
  Standalone calls swallow errors on purpose: a failed audit write must never
  break a login. Calls inside a transaction re-throw.
- 2026-08-03 - lib/repos/authRepo.js created: the ONLY file with SQL in
  feature 13. Contains login lookup, atomic lockout, setPassword (bumps
  session_epoch + stamps password_changed_at in one statement) and all OTP
  queries including the 30-per-rolling-year cap.
- 2026-08-03 - VERIFIED against db/schema.sql: profiles had NO existing column
  equivalent to session_epoch or password_changed_at under any name.
  must_change_password is a boolean flag, not a date, so it cannot drive the
  admin 30-day rotation. Migration 002 was necessary.

---

## 13. Decisions log

Append-only. Newest at the bottom. One line per decision, with the reason.

### 2026-08-01 — 2026-08-03 (setup)

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
  The rows ARE the history — no counter columns, no cron reset, no midnight
  double-spend race.
- .vscode/settings.json added to silence the false "Unknown at rule @theme"
  warning on Tailwind v4.
- lib/audit.js pulled forward from feature 14 because auth must log
  auth.admin_login and auth.lockout on day one. Signature deviates from the
  planning docs: logAudit(entry, client = null).
- lib/repos/authRepo.js created — the ONLY file with SQL in this feature.
- VERIFIED against db/schema.sql: profiles had no existing equivalent of
  session_epoch or password_changed_at under any name. must_change_password is
  a boolean, not a date, so it cannot drive the 30-day admin rotation.
  Migration 002 was necessary.

### 2026-08-03 (sessions and login)

- lib/auth.js EXTENDED, not rewritten. It imports only `jose` and must stay
  that way — proxy.js runs on Edge and cannot load `pg`.
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
- OtpInput deferred to 9B — build a component when its screen exists.
- ANTI-ENUMERATION is byte-identical: same status, same body, same headers for
  a wrong password and an unknown phone. A DUMMY_HASH comparison keeps the
  timing equal too. Consequence for testing: the HTTP response tells you
  nothing; judge behaviour from the dev terminal and the database.
- Task 6 home page: the session_epoch check lives in app/page.js, not in
  proxy.js, because Edge cannot load `pg`. Architectural exception recorded —
  a server component MAY read via a repo; all WRITES still go through /api/*.
- Kill switch VERIFIED: bumping session_epoch in psql logged the browser out
  on the next refresh.
- proxy.js is DEFAULT-DENY. Consequence: /api/branches and /api/classes now
  require a session — they used to be open. Feature 01 must know.
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
- No audit rows for OTP or password events — one row per reset would be noise.
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
  even though the user is already signed in — a borrowed unlocked phone must
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
  server. Test helpers must fail LOUDLY — a helper that silently sent an empty
  session produced an indistinguishable 401 and wasted a round of testing.

### 2026-08-05 (reset UI, cooldown, docs)

- /forgot-password is ONE route with three steps (phone -> code -> password)
  because each step depends on a short-lived cookie from the previous one.
- Client components cannot export `metadata`. The interactive reset pages
  therefore have none.
- The code step advances even for an unknown number — stopping there would
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
  decides. No schema change was needed — created_at plus idx_otp_phone are
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
- ALL TEST ACCOUNTS reset to Pass@123 at the end of feature 13 — one SQL
  statement that also clears lockouts and bumps session_epoch. Note that it
  restarts every admin's 30-day rotation clock. No code changed.


## Pre-production checklist (do not deploy without)

- [ ] Rotate school_app DB password; new JWT_SECRET
- [ ] Wipe/replace seed logins & Pass@123
- [ ] Real SMS provider env vars (MSG91/Fast2SMS + DLT)
- [ ] Real VAPID keys for web-push
- [ ] HTTPS (nginx + Let's Encrypt), pm2 for app + workers
- [ ] Nightly pg_dump cron + one tested restore
