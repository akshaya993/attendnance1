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
| 09 | Notifications + lib/notify.js + PWA files | DONE (tested 2026-08-11) | Tracker row was stale; feature 09 was completed and tested - see context/features/09-notifications/09-0-decisions.md for evidence. lib/guard.js extracted as planned (open risk below is RESOLVED) |
| 01 | Attendance (rest) | DONE (tested 2026-08-13) | Role-first URLs (/teacher|/parent|/admin/attendance). Owner's working-day rule: a class+date submission row IS the working-day mark; school_calendar NOT used; Sunday/holiday submissions count. Absent-only toggle, 1 teacher edit, unlimited admin override (audited), parents alerted (bell+push, priority important). Staff tab deferred - see context/features/01-attendance/. Reuses guard/audit/notify. Test residue in dev DB: 2026-08-13 submissions for classes 49+50 |
| 04 | Fees | DONE (tested 2026-08-13/14) | Role-first URLs (/admin/fees, /parent/fees). Money invariants live: FOR UPDATE lock, SQL-side overpay refusal, receipt+balance+audit in ONE transaction. All 4 categories drillable. Parent payment alerts (bell+push, important). Receipts are print-friendly pages (pdfkit path documented in context/features/04-fees/, not installed). Installments deferred to feature 14. Test residue: receipts #101015/#101016 on fee 897 |
| 05 | Groups/chat | not started | |
| 07 | Marks | not started | |
| 10 | Timetable | not started | |
| 02 | Bus tracking + busAlarmWorker | not started | owes feature 13: bus role caging + post-login redirect target |
| 03 | Complaints & feedback + lib/ai.js | COMPLAINTS DONE (tested 2026-08-14); FEEDBACK deferred by owner | Complaints: parent submit + admin inbox (unread-first queue, flags, profile popover, reply, guarded resolve, AI copilot gracefully-off). Lifecycle locked: reply != resolved; resolve needs a reply; no reopen. Alerts both sides (bell+buzz, linkUrl deep-links). Feedback fully specced, not built - see context/features/03-complaints/03-2-feedback-future-spec.md. ALSO: pdfkit installed (owner-approved) + fee receipt PDF route added (next.config.mjs now needs serverExternalPackages:['pdfkit']). Test residue: complaint id 4 |
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

**RESOLVED:** the `must_change_password` / session_epoch open risk was fixed by
feature 09 - `lib/guard.js` now owns `requireActiveSession()` /
`requireActiveApiSession()` and every page and API route (including all of
feature 01's) calls them.

**New note from feature 01:** parent login `9810000001` no longer accepts
Pass@123 (changed during earlier testing). Use `9810000002` for parent tests.

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