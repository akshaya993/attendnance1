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

## Seed logins (password for all: Pass@123)

admin 9000000001 | teachers 9000000101-120 | parents 9810000001-400 |
buses 9000000021/22. All fake - replace before production.

## Feature status

| # | Feature | Status | Notes |
|---|---|---|---|
| 01-P0 | Project skeleton (lib/db.js, auth stub, branches/classes APIs) | NOT STARTED - NEXT UP | Tell AI: DB already exists, do NOT create schema |
| 13 | Auth, OTP, middleware, real lib/auth.js | IN PROGRESS | shell + migration 002 done; see context/13-0-decisions.md |
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

## Pre-production checklist (do not deploy without)

- [ ] Rotate school_app DB password; new JWT_SECRET
- [ ] Wipe/replace seed logins & Pass@123
- [ ] Real SMS provider env vars (MSG91/Fast2SMS + DLT)
- [ ] Real VAPID keys for web-push
- [ ] HTTPS (nginx + Let's Encrypt), pm2 for app + workers
- [ ] Nightly pg_dump cron + one tested restore
