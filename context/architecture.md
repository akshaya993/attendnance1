# ARCHITECTURE
## School App - System Design & Structure

> CONTEXT FILE 2 of 6.

## Stack (locked - do not substitute)

- Next.js (App Router), JavaScript (NOT TypeScript)
- PostgreSQL 16 - the ONLY database. Raw SQL via `pg`. NO ORM.
- bcryptjs (hashing), jose (JWT in httpOnly cookie)
- Tailwind CSS; pdfkit (PDFs); sharp (image->WebP); web-push (notifications);
  @dnd-kit (timetable builder)
- Production: pm2 + nginx + Let's Encrypt on one VPS; nightly pg_dump
- Deferred until measurement demands: Redis, Socket.IO, Docker, S3/MinIO, TypeScript

## The four layers (strict, one-way data flow)

```
app/            PAGES - server-rendered UI. NEVER imports pg or repos directly
                        for mutations; reads may use repos in server components.
app/api/        API ROUTES - auth check -> validate input -> call repo -> respond.
components/     Reusable UI widgets. Receive data via props. No SQL, no fetch
                logic beyond what the page passes down.
lib/            Logic layer. lib/repos/*.js = THE ONLY FILES CONTAINING SQL.
```

Flow: browser -> page -> fetch('/api/...') -> route.js -> lib/repos/xRepo.js -> PostgreSQL.

## Folder structure

```
school-app/
|-- .env.local              # DATABASE_URL, JWT_SECRET (+ SMS_*, VAPID_* later)
|-- middleware.js           # JWT verification on protected routes (feature 13)
|-- db/                     # schema.sql + seed.sql (REFERENCE ONLY - already loaded)
|   |-- migrations/         # future numbered ALTER files (002_x.sql ...)
|-- app/
|   |-- login/  admin/  teacher/  parent/  bus/      # pages per role
|   |-- api/    # auth/ attendance/ fees/ marks/ bus/ groups/ leaves/ complaints/
|               # feedback/ admissions/ notifications/ timetable/ profiles/ posts/
|               # promotions/ health/
|-- components/             # one subfolder per feature
|-- lib/
|   |-- db.js               # ONLY file importing pg. Pool {max:15, idleTimeoutMillis:30000,
|   |                       # connectionTimeoutMillis:5000}. Exports query, withTransaction, pool.
|   |-- auth.js             # getSession/requireRole (stub in Prompt 0, real in feature 13)
|   |-- notify.js audit.js sms.js ai.js eta.js uploads.js privacy.js activeChild.js
|   |-- repos/              # 15 repos: attendanceRepo busRepo complaintRepo feedbackRepo
|                           # feeRepo groupRepo leaveRepo marksRepo admissionRepo
|                           # notificationRepo timetableRepo profileRepo postRepo
|                           # authRepo promotionRepo
|-- workers/                # pm2-run loops: busAlarmWorker.js, feeReminders.js
|-- public/                 # manifest.json, icons/, uploads/ (WebP on disk)
```

## Shared-file ownership (create once, import everywhere)

| File | Created by | Used by |
|---|---|---|
| lib/db.js | 01 Prompt 0 | everything |
| lib/auth.js | stub 01-P0, REAL version feature 13 | everything |
| middleware.js | 13 | all protected routes |
| lib/notify.js | 09 | 02,03,04,06,08,10,11,12,14 |
| lib/audit.js | 14-Prompt1 (create early, when 04 needs it) | 01,04,07,08,11,12,13 |
| lib/ai.js | 03 | 07 |

NEVER recreate these files in another feature. Import them.

## Database (43 tables) - key design decisions

- profiles = ALL logins (role: admin/teacher/parent/bus). students are NOT logins;
  each student row points to parent_profile_id.
- students.class_id = fast current-class pointer; student_enrollments = permanent
  per-year history (promotions write here).
- Attendance is EXCEPTION-ONLY: present students have NO row. Statuses:
  absent/late/half_day. Percentage math: no row=1, late=1, half_day=0.5, absent=0;
  working days come from school_calendar.
- fees.balance_due is a precomputed running balance updated in the SAME transaction
  as every receipt insert. Installment paid-status is DERIVED from cumulative
  receipts vs cumulative installment amounts - never stored.
- Bus GPS: ONE row per bus updated in place (last_lat/last_lng/last_ping_at,
  fillfactor 70). Never insert per-ping rows.
- Chat unread counts derived from group_members.last_read_at. Never store counters.
- Notifications use precomputed fan-out (notification_recipients row per user);
  unread badge served by partial index WHERE is_read = false.
- audit_logs written ONLY via lib/audit.js logAudit(client, {...}) inside the same
  transaction as sensitive mutations (money, marks overrides, deletes, promotions,
  admin logins). Never on reads.
- Money = NUMERIC(10,2). PKs = BIGINT GENERATED ALWAYS AS IDENTITY. TIMESTAMPTZ for
  moments, DATE for calendar days.

## Indexes

25 exist, designed around hot screens (unread badge, dues list, chat history, report
cards, teacher conflict checks). Partial indexes cover hot slices (WHERE balance_due>0,
WHERE is_read=false, WHERE status='pending'). Do NOT add new indexes speculatively -
only when EXPLAIN ANALYZE shows a Seq Scan on a big table in a hot query.

## Environment variables (all config goes through env)

DATABASE_URL, JWT_SECRET, SMS_PROVIDER=console|msg91|fast2sms, SMS_API_KEY,
SMS_SENDER_ID, SMS_DLT_TEMPLATE_ID, AI_BASE_URL, AI_API_KEY, AI_MODEL,
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
Every integration must have a 'console'/dev mode so the app runs without real
providers.
