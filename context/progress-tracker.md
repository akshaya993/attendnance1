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
- [ ] db/ folder in project with schema.sql + seed.sql reference copies
- [ ] 6 context files placed in project /context folder

## Seed logins (password for all: Pass@123)

admin 9000000001 | teachers 9000000101-120 | parents 9810000001-400 |
buses 9000000021/22. All fake - replace before production.

## Feature status

| # | Feature | Status | Notes |
|---|---|---|---|
| 01-P0 | Project skeleton (lib/db.js, auth stub, branches/classes APIs) | NOT STARTED - NEXT UP | Tell AI: DB already exists, do NOT create schema |
| 13 | Auth, OTP, middleware, real lib/auth.js | not started | |
| 09 | Notifications + lib/notify.js + PWA files | not started | |
| 01 | Attendance (rest) | not started | |
| 14-P1 | lib/audit.js ONLY (needed by 04) | not started | rest of 14 comes later |
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

- (add entries here as they happen)

## Pre-production checklist (do not deploy without)

- [ ] Rotate school_app DB password; new JWT_SECRET
- [ ] Wipe/replace seed logins & Pass@123
- [ ] Real SMS provider env vars (MSG91/Fast2SMS + DLT)
- [ ] Real VAPID keys for web-push
- [ ] HTTPS (nginx + Let's Encrypt), pm2 for app + workers
- [ ] Nightly pg_dump cron + one tested restore
