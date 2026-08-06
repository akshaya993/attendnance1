# PROGRESS TRACKER
## School App - Live Build Status

> STATUS FILE. UPDATE THIS AFTER EVERY COMPLETED PROMPT.
> This file answers 'where are we?' and nothing else.
> Decisions and reasoning belong in 13-0-decisions.md, not here.

## Environment (all verified working)

- [x] PostgreSQL 16 on Windows, port 5432, service postgresql-x64-16
- [x] Database `school`, app user `school_app` (dev password - rotate before prod)
- [x] Schema loaded: 43 tables + 25 indexes
- [x] Seed data loaded: 1 branch, 16 classes (1-7 A; 8/9/10 A/B/C), 400 students,
      400 parents, 20 teachers, 2 buses, full fees/marks/attendance/timetable/chat
- [x] Node.js v22.20.0
- [x] Next.js 16.2.12 app at C:\projects\school-app (JS, Tailwind v4, ESLint,
      App Router, no src/, no React Compiler, AGENTS.md included)
- [x] pg + bcryptjs + jose + nodemailer installed
- [x] .env.local with DATABASE_URL, JWT_SECRET, SMS_*, MAIL_*
- [x] Gmail App Password delivery verified end to end
- [x] Health check /api/health -> {"ok":true,"students":400}
- [x] db/ folder in project with schema.sql + seed.sql reference copies
- [x] 12 docs in /context (6 planning + 00-MASTER-REFERENCE + 00-PROJECT-STRUCTURE
      + 01-0-explanation + the three 13-* auth docs)
- [x] db/migrations/002_auth_columns.sql applied
- [ ] next@16.3.0 upgrade - REQUIRED before feature 12 (vulnerable sharp/postcss)

## Seed logins (password for all: Pass@123)

admin 9000000001 | teachers 9000000101-120 | parents 9810000001-400 |
buses 9000000021/22. All fake - replace before production.

## Feature status

| # | Feature | Status | Notes |
|---|---|---|---|
| 01-P0 | Project skeleton (lib/db.js, auth stub, branches/classes APIs) | DONE | lib/db.js, lib/auth.js stub, app/api/branches, app/api/classes, app/api/health all present. branches/classes now require a session (proxy.js default-deny) |
| 13 | Auth, OTP, proxy.js, real lib/auth.js | DONE (tested 2026-08-05) | Tasks 0-9C all tested. Login+lockout+audit, 100/30-day sliding sessions, session_epoch kill switch, proxy.js role gates, email OTP via nodemailer/Gmail, reset + forced change, password policy, 45s OTP cooldown.Docs: context/features/13-auth/ (13-0-decisions, 13-1-otp-and-auth-spec, 13-2-feature-13-reference) + context/00-MASTER-REFERENCE.md |
| 14-P1 | lib/audit.js ONLY (needed by 04) | DONE - built during feature 13 | auth needs it for auth.admin_login / auth.lockout. Features 01/04/07/08/11/12/14 must IMPORT it, never recreate. Feature 14 must SKIP its Prompt 1 |
| 09 | Notifications + lib/notify.js + PWA files | not started | START WITH the lib/guard.js extraction - see OPEN RISK below |
| 01 | Attendance (rest) | not started | |
| 04 | Fees | not started | import lib/audit.js, do not create it |
| 05 | Groups/chat | not started | |
| 07 | Marks | not started | |
| 10 | Timetable | not started | |
| 02 | Bus tracking + busAlarmWorker | not started | owes feature 13: bus role caging + post-login redirect target |
| 03 | Complaints & feedback + lib/ai.js | not started | two features in one file - split across two sessions |
| 06 | Leaves | not started | |
| 08 | Admissions | not started | |
| 12 | Posts | not started | BLOCKED until next@16.3.0 upgrade (sharp) |
| 14 | Promotions & year-end (rest) + feeReminders worker | not started | creates db/migrations/001_v1_1.sql |
| 11 | Profiles & privacy | not started | owes feature 13: wire the Change Password button to /api/auth/change-password |
| - | Deployment (VPS, pm2, nginx, HTTPS, backups) | not started | see checklist below |

## How to update this file (AI: do this every time)

After each completed prompt, change the feature row's Status to one of:
in progress / built - needs manual test / DONE (tested <date>). Add one-line notes
for anything the next session must know (bugs found, TODOs, deviations).
Put REASONING in 13-0-decisions.md (or that feature's own decisions file),
never here.

## Known issues / open risks

All feature-13 decisions and reasoning:
context/features/13-auth/13-0-decisions.md section 13.
Do not duplicate them here.

**OPEN RISK - feature 09 must fix this first.** `must_change_password` is
enforced in `app/page.js`, not in `proxy.js`, because the Edge runtime cannot
reach PostgreSQL. It therefore guards ONLY the `/` route. The moment a second
page exists, a user with the flag set can navigate straight past the forced
password change. Before adding any new page: extract that check into
`lib/guard.js` as `requireActiveSession()` and call it as the first line of
every server page.

**Carried forward from feature 13** (each blocked on a feature that does not
exist yet):
- Bus role is not caged to the location-ping scope -> feature 02
- Bus login has no dedicated redirect target -> feature 02
- Profile "Change Password" button is not wired -> feature 11
- proxy.js ROLE_PREFIXES only covers /admin /teacher /parent /bus - add rows as
  each feature adds routes
- No `?next=` return-to-page parameter after login (deliberate; revisit when
  deep links exist)

**Known dead code, kept deliberately:** validatePassword's "cannot be your
phone number" branch is unreachable ("must include a letter" fires first).
`otp_codes.purpose = 'first_login'` is never written today.

**Not in ANY prompt file - must be scheduled separately (~2 days):** role
dashboards and session-aware navigation. `/admin`, `/teacher`, `/parent` and
`/bus` currently 404. Every feature assumes they exist.

## Pre-production checklist (do not deploy without)

- [ ] Rotate school_app DB password; new JWT_SECRET
- [ ] Wipe/replace seed logins & Pass@123
- [ ] Upgrade to next@16.3.0 (clears sharp + postcss advisories)
- [ ] Real SMS provider env vars (MSG91 + TRAI DLT registration)
- [ ] Real VAPID keys for web-push
- [ ] Production mail provider (Amazon SES / Brevo) with SPF + DKIM + DMARC
- [ ] HTTPS (nginx + Let's Encrypt), pm2 for app + workers
- [ ] Nightly pg_dump cron + one tested restore